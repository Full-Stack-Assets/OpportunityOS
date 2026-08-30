import json
from typing import Any

import requests

import freelancer_mcp_server as source


def _result(status: str, message: str, *, verified: bool = False, **extra: Any) -> str:
    payload = {
        "status": status,
        "source": "freelancer",
        "verified": verified,
        "message": message,
        "observed_at": source._utc_now(),
    }
    payload.update(extra)
    return json.dumps(payload, indent=2)


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _auth_headers() -> dict[str, str] | None:
    if not source.ACCESS_TOKEN:
        return None
    return {
        "Authorization": f"Bearer {source.ACCESS_TOKEN}",
        "User-Agent": "FreelancerPursuitGateway/1.0",
    }


def inspect_freelancer_bid(project_id: int) -> str:
    project_id = _positive_int(project_id)
    if project_id is None:
        return _result("error", "project_id must be a positive integer")
    headers = _auth_headers()
    if headers is None:
        return _result("auth_required", "Freelancer OAuth access token is not configured.")

    base = source.FREELANCER_API_BASE.rstrip("/")
    try:
        self_response = requests.get(f"{base}/users/0.1/self/", headers=headers, timeout=10)
        project_response = requests.get(
            f"{base}/projects/0.1/projects/",
            headers=headers,
            params={"projects[]": [project_id], "compact": True, "full_description": True, "job_details": True},
            timeout=10,
        )
    except requests.RequestException:
        return _result("unavailable", "Freelancer inspect request could not be completed.")

    if self_response.status_code != 200:
        return _result("auth_required" if self_response.status_code in {401, 403} else "unavailable", "Freelancer account identity could not be verified.", status_code=self_response.status_code)
    if project_response.status_code != 200:
        return _result("unavailable", "Freelancer project could not be inspected.", status_code=project_response.status_code)

    try:
        self_payload = self_response.json()
        project_payload = project_response.json()
    except (TypeError, ValueError):
        return _result("invalid_response", "Freelancer inspect returned malformed JSON.")

    self_result = self_payload.get("result") if isinstance(self_payload, dict) else None
    account_id = source._source_identifier(self_result.get("id")) if isinstance(self_result, dict) else None

    project_result = project_payload.get("result") if isinstance(project_payload, dict) else None
    projects = project_result.get("projects") if isinstance(project_result, dict) else None
    candidate = None
    if isinstance(projects, list):
        candidate = next((p for p in projects if isinstance(p, dict) and source._source_identifier(p.get("id")) == str(project_id)), None)
    elif isinstance(projects, dict):
        candidate = projects.get(str(project_id)) or projects.get(project_id)
    if account_id is None or not isinstance(candidate, dict):
        return _result("invalid_response", "Freelancer inspect could not establish account and project identity.")

    return _result(
        "success",
        "Freelancer account and project identities verified for read-only inspection.",
        verified=True,
        account_id=account_id,
        project_id=str(project_id),
        title=source._source_string(candidate.get("title")),
        bid_count=source._source_nonnegative_int((candidate.get("bid_stats") or {}).get("bid_count")) if isinstance(candidate.get("bid_stats"), dict) else None,
        external_side_effects=0,
    )


def submit_freelancer_bid(**kwargs: Any) -> str:
    return source.submit_freelancer_bid(**kwargs)


def verify_freelancer_bid(bid_id: int, *, project_id: int | None = None, bidder_id: int | None = None) -> str:
    bid_id = _positive_int(bid_id)
    if bid_id is None:
        return _result("error", "bid_id must be a positive integer")
    if project_id is not None and _positive_int(project_id) is None:
        return _result("error", "project_id must be a positive integer when supplied")
    if bidder_id is not None and _positive_int(bidder_id) is None:
        return _result("error", "bidder_id must be a positive integer when supplied")
    headers = _auth_headers()
    if headers is None:
        return _result("auth_required", "Freelancer OAuth access token is not configured.")

    url = f"{source.FREELANCER_API_BASE.rstrip('/')}/projects/0.1/bids/"
    try:
        response = requests.get(url, headers=headers, params={"bids[]": [bid_id], "limit": 1}, timeout=10)
    except requests.RequestException:
        return _result("unavailable", "Freelancer bid verification request could not be completed.")
    if response.status_code != 200:
        return _result("unavailable", "Freelancer did not return a successful verification response.", status_code=response.status_code)
    try:
        data = response.json()
    except (TypeError, ValueError):
        return _result("invalid_response", "Freelancer returned malformed verification JSON.")

    result = data.get("result") if isinstance(data, dict) else None
    bids = result.get("bids") if isinstance(result, dict) else None
    candidate = None
    if isinstance(bids, dict):
        candidate = bids.get(str(bid_id)) or bids.get(bid_id)
    elif isinstance(bids, list):
        candidate = next((bid for bid in bids if isinstance(bid, dict) and source._source_identifier(bid.get("id")) == str(bid_id)), None)
    if not isinstance(candidate, dict):
        return _result("executed_unverified", "No matching bid was found during independent reconciliation.")

    observed_project = source._source_identifier(candidate.get("project_id"))
    observed_bidder = source._source_identifier(candidate.get("bidder_id"))
    if project_id is not None and observed_project != str(project_id):
        return _result("executed_unverified", "Bid ID exists but project identity does not match the authorized application.")
    if bidder_id is not None and observed_bidder != str(bidder_id):
        return _result("executed_unverified", "Bid ID exists but bidder identity does not match the authorized application.")

    return json.dumps({
        "status": "submitted_verified",
        "source": "freelancer",
        "verified": True,
        "external_id": str(bid_id),
        "project_id": observed_project,
        "bidder_id": observed_bidder,
        "evidence_refs": [f"freelancer-api://bid/{bid_id}"],
        "verified_at": source._utc_now(),
    }, indent=2)
