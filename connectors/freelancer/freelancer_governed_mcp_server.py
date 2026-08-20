import hashlib
import json
import math
import os
from typing import Any
from urllib.parse import urlparse

import requests
from mcp.server import MCPServer

import freelancer_mcp_server as public_adapter

mcp = MCPServer("Freelancer Governed Connector")

FREELANCER_API_BASE = os.getenv("FREELANCER_API_BASE", "https://www.freelancer.com/api")
ACCESS_TOKEN = os.getenv("FREELANCER_ACCESS_TOKEN", "")
CONNECTOR_VERSION = "1.0.0"


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


# This must remain false until Human Authority has verified Freelancer's written
# permission for the intended automated API use. Merely possessing a token is not permission.
AUTOMATION_PERMISSION_CONFIRMED = _env_truthy("FREELANCER_AUTOMATION_PERMISSION_CONFIRMED")


def _utc_safe_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, sort_keys=True)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash_payload(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _nonblank(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-blank string")
    return value.strip()


def _identifier(value: Any, field: str) -> str:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a positive identifier")
    if isinstance(value, int) and value > 0:
        return str(value)
    if isinstance(value, str) and value.strip().isdigit() and int(value.strip()) > 0:
        return str(int(value.strip()))
    raise ValueError(f"{field} must be a positive identifier")


def _positive_number(value: Any, field: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a positive finite number")
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{field} must be a positive finite number")
    return value


def _positive_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return value


def _percentage(value: Any, field: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be between 0 and 100")
    if not math.isfinite(value) or value < 0 or value > 100:
        raise ValueError(f"{field} must be between 0 and 100")
    return value


def _bounded_limit(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 50:
        raise ValueError("limit must be an integer between 1 and 50")
    return value


def _nonnegative_offset(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError("offset must be a non-negative integer")
    return value


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "OpportunityOS-Freelancer-Governed/1.0",
    }


def _gate_status(operation: str) -> str | None:
    if not AUTOMATION_PERMISSION_CONFIRMED:
        return _utc_safe_json({
            "status": "permission_required",
            "source": "freelancer",
            "operation": operation,
            "outcome": "ESCALATED",
            "retry_safe": False,
            "message": "Written permission for automated Freelancer API access has not been confirmed.",
        })
    if not ACCESS_TOKEN:
        return _utc_safe_json({
            "status": "auth_required",
            "source": "freelancer",
            "operation": operation,
            "outcome": "ESCALATED",
            "retry_safe": False,
            "message": "A Freelancer OAuth access token is required.",
        })
    return None


def _authority_gate(authority_ref: str, operation: str) -> str | None:
    try:
        authority_ref = _nonblank(authority_ref, "authority_ref")
    except ValueError:
        return _utc_safe_json({
            "status": "authority_required",
            "source": "freelancer",
            "operation": operation,
            "outcome": "ESCALATED",
            "retry_safe": False,
            "message": "A payload-bound Canon Human Authority reference is required.",
        })
    if not authority_ref.startswith("canon:approval:"):
        return _utc_safe_json({
            "status": "authority_required",
            "source": "freelancer",
            "operation": operation,
            "outcome": "ESCALATED",
            "retry_safe": False,
            "message": "The authority reference must identify a Canon approval record.",
        })
    return None


def _package_integrity(prepared_json: str, expected_kind: str) -> tuple[dict[str, Any] | None, str | None]:
    try:
        payload = json.loads(prepared_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None, "prepared package must be valid JSON"
    if not isinstance(payload, dict) or payload.get("status") != "prepared":
        return None, "prepared package wrapper is invalid"
    package = payload.get("package")
    if not isinstance(package, dict) or package.get("kind") != expected_kind:
        return None, "prepared package kind is invalid"
    supplied_hash = package.get("package_hash")
    supplied_key = package.get("idempotency_key")
    if not isinstance(supplied_hash, str) or not supplied_hash:
        return None, "prepared package hash is missing"
    if not isinstance(supplied_key, str) or not supplied_key:
        return None, "prepared package idempotency key is missing"
    body = {key: value for key, value in package.items() if key not in {"package_hash", "idempotency_key"}}
    if _hash_payload(body) != supplied_hash:
        return None, "prepared package hash mismatch"
    expected_key = f"freelancer:{expected_kind}:{_hash_payload({'package_hash': supplied_hash, 'action_intent_id': body.get('action_intent_id')})}"
    if supplied_key != expected_key:
        return None, "prepared package idempotency key mismatch"
    return package, None


def _invalid_package(operation: str, message: str) -> str:
    return _utc_safe_json({
        "status": "invalid_package",
        "source": "freelancer",
        "operation": operation,
        "outcome": "FAILED",
        "retry_safe": False,
        "message": message,
    })


def _result_records(payload: Any, key: str) -> list[dict[str, Any]] | None:
    if not isinstance(payload, dict):
        return None
    result = payload.get("result")
    if isinstance(result, dict):
        records = result.get(key)
        if isinstance(records, list):
            return [item for item in records if isinstance(item, dict)]
    if isinstance(result, list):
        return [item for item in result if isinstance(item, dict)]
    return None


@mcp.tool()
def search_freelancer_projects(query: str, limit: int = 5) -> str:
    """Search verified public Freelancer buyer projects using the existing official API adapter."""
    return public_adapter.search_freelancer_projects(query, limit)


@mcp.tool()
def get_freelancer_user_profile(username: str) -> str:
    """Retrieve public Freelancer profile evidence using the existing official API adapter."""
    return public_adapter.get_freelancer_user_profile(username)


@mcp.tool()
def generate_freelancer_oauth_auth_url(client_id: str, redirect_uri: str) -> str:
    """Generate the official Freelancer OAuth authorization URL. Token exchange remains out-of-band."""
    return public_adapter.generate_freelancer_oauth_auth_url(client_id, redirect_uri)


@mcp.tool()
def prepare_freelancer_bid(
    project_id: int,
    bidder_id: int,
    description: str,
    amount: float,
    period: int,
    milestone_percentage: float,
    action_intent_id: str,
    listing_fingerprint: str,
) -> str:
    """Prepare and hash a Freelancer bid locally. This never performs a provider write."""
    try:
        body: dict[str, Any] = {
            "kind": "freelancer_bid",
            "project_id": _identifier(project_id, "project_id"),
            "bidder_id": _identifier(bidder_id, "bidder_id"),
            "description": _nonblank(description, "description"),
            "amount": _positive_number(amount, "amount"),
            "period": _positive_int(period, "period"),
            "milestone_percentage": _percentage(milestone_percentage, "milestone_percentage"),
            "action_intent_id": _nonblank(action_intent_id, "action_intent_id"),
            "listing_fingerprint": _nonblank(listing_fingerprint, "listing_fingerprint"),
        }
    except ValueError as exc:
        return _utc_safe_json({
            "status": "error",
            "source": "freelancer",
            "verified": False,
            "message": str(exc),
        })

    package_hash = _hash_payload(body)
    body["package_hash"] = package_hash
    body["idempotency_key"] = f"freelancer:freelancer_bid:{_hash_payload({'package_hash': package_hash, 'action_intent_id': body['action_intent_id']})}"
    return _utc_safe_json({
        "status": "prepared",
        "source": "freelancer",
        "verified": True,
        "connector_prerequisites_satisfied": bool(AUTOMATION_PERMISSION_CONFIRMED and ACCESS_TOKEN),
        "package": body,
    })


def _reconcile_existing_bid(package: dict[str, Any]) -> tuple[str, str | None]:
    url = f"{FREELANCER_API_BASE.rstrip('/')}/projects/0.1/bids/"
    params = {"projects[]": [int(package["project_id"])]}
    try:
        response = requests.get(url, headers=_headers(), params=params, timeout=10)
    except requests.RequestException:
        return "unavailable", None
    if response.status_code != 200:
        return "unavailable", None
    try:
        bids = _result_records(response.json(), "bids")
    except ValueError:
        return "unavailable", None
    if bids is None:
        return "unavailable", None
    for bid in bids:
        if str(bid.get("project_id")) == package["project_id"] and str(bid.get("bidder_id")) == package["bidder_id"]:
            bid_id = bid.get("id")
            if isinstance(bid_id, (str, int)) and str(bid_id).strip():
                return "exists", str(bid_id)
    return "clear", None


@mcp.tool()
def submit_freelancer_bid(prepared_json: str, authority_ref: str) -> str:
    """Submit a prepared bid through Freelancer's official API after all governance gates pass."""
    operation = "submit_bid"
    package, error = _package_integrity(prepared_json, "freelancer_bid")
    if package is None:
        return _invalid_package(operation, error or "invalid prepared package")

    gate = _gate_status(operation)
    if gate is not None:
        return gate
    authority_gate = _authority_gate(authority_ref, operation)
    if authority_gate is not None:
        return authority_gate

    reconciliation, existing_bid_id = _reconcile_existing_bid(package)
    if reconciliation == "exists":
        return _utc_safe_json({
            "status": "verified_noop",
            "source": "freelancer",
            "operation": operation,
            "outcome": "VERIFIED_NOOP",
            "provider_submission_id": existing_bid_id,
            "provider_thread_id": None,
            "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"],
            "verification_method": "official_api_read_before_write",
            "amount_committed": 0,
            "retry_safe": False,
        })
    if reconciliation != "clear":
        return _utc_safe_json({
            "status": "reconciliation_unavailable",
            "source": "freelancer",
            "operation": operation,
            "outcome": "ESCALATED",
            "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"],
            "retry_safe": False,
            "reconcile_before_retry": True,
            "message": "Existing-bid reconciliation could not be verified; submission was not attempted.",
        })

    url = f"{FREELANCER_API_BASE.rstrip('/')}/projects/0.1/bids/"
    bid_data = {
        "project_id": int(package["project_id"]),
        "bidder_id": int(package["bidder_id"]),
        "description": package["description"],
        "amount": package["amount"],
        "period": package["period"],
        "milestone_percentage": package["milestone_percentage"],
    }
    try:
        response = requests.post(url, headers=_headers(), json=bid_data, timeout=10)
    except requests.RequestException:
        return _utc_safe_json({
            "status": "unknown_outcome",
            "source": "freelancer",
            "operation": operation,
            "outcome": "UNKNOWN_OUTCOME",
            "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"],
            "provider_submission_id": None,
            "retry_safe": False,
            "reconcile_before_retry": True,
            "message": "The bid write outcome is unknown; reconcile with Freelancer before any retry.",
        })

    if response.status_code >= 500:
        return _utc_safe_json({
            "status": "unknown_outcome",
            "source": "freelancer",
            "operation": operation,
            "outcome": "UNKNOWN_OUTCOME",
            "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"],
            "provider_submission_id": None,
            "retry_safe": False,
            "reconcile_before_retry": True,
            "status_code": response.status_code,
        })
    if response.status_code != 200:
        return _utc_safe_json({
            "status": "failed",
            "source": "freelancer",
            "operation": operation,
            "outcome": "FAILED",
            "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"],
            "provider_submission_id": None,
            "retry_safe": False,
            "status_code": response.status_code,
        })

    try:
        payload = response.json()
    except ValueError:
        payload = None
    result = payload.get("result") if isinstance(payload, dict) else None
    bid_id = result.get("id") if isinstance(result, dict) else None
    if not isinstance(bid_id, (str, int)) or not str(bid_id).strip():
        return _utc_safe_json({
            "status": "unknown_outcome",
            "source": "freelancer",
            "operation": operation,
            "outcome": "UNKNOWN_OUTCOME",
            "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"],
            "provider_submission_id": None,
            "retry_safe": False,
            "reconcile_before_retry": True,
            "message": "Freelancer did not return a verifiable bid identifier.",
        })

    return _utc_safe_json({
        "status": "success",
        "source": "freelancer",
        "operation": operation,
        "outcome": "SUCCESS",
        "provider_submission_id": str(bid_id),
        "provider_thread_id": None,
        "idempotency_key": package["idempotency_key"],
        "package_hash": package["package_hash"],
        "verification_method": "official_api_submission_identifier",
        "amount_committed": 0,
        "retry_safe": False,
    })


@mcp.tool()
def list_freelancer_threads(limit: int = 20, offset: int = 0) -> str:
    """Read authenticated Freelancer message threads after automated API permission is confirmed."""
    operation = "read_threads"
    try:
        limit = _bounded_limit(limit)
        offset = _nonnegative_offset(offset)
    except ValueError as exc:
        return _utc_safe_json({"status": "error", "source": "freelancer", "verified": False, "message": str(exc)})
    gate = _gate_status(operation)
    if gate is not None:
        return gate

    url = f"{FREELANCER_API_BASE.rstrip('/')}/messages/0.1/threads/"
    try:
        response = requests.get(url, headers=_headers(), params={"limit": limit, "offset": offset}, timeout=10)
    except requests.RequestException:
        return _utc_safe_json({
            "status": "unavailable", "source": "freelancer", "verified": False,
            "operation": operation, "threads": [], "message": "Freelancer thread retrieval could not be completed.",
        })
    if response.status_code != 200:
        return _utc_safe_json({
            "status": "unavailable", "source": "freelancer", "verified": False,
            "operation": operation, "threads": [], "status_code": response.status_code,
        })
    try:
        payload = response.json()
    except ValueError:
        payload = None
    threads = _result_records(payload, "threads")
    if threads is None:
        return _utc_safe_json({
            "status": "invalid_response", "source": "freelancer", "verified": False,
            "operation": operation, "threads": [],
        })
    return _utc_safe_json({
        "status": "success", "source": "freelancer", "verified": True,
        "operation": operation, "count": len(threads), "threads": threads,
        "retrieval_method": "freelancer_official_api",
    })


@mcp.tool()
def prepare_freelancer_message(thread_id: int, message: str, action_intent_id: str) -> str:
    """Prepare and hash a Freelancer thread message locally without sending it."""
    try:
        body: dict[str, Any] = {
            "kind": "freelancer_message",
            "thread_id": _identifier(thread_id, "thread_id"),
            "message": _nonblank(message, "message"),
            "action_intent_id": _nonblank(action_intent_id, "action_intent_id"),
        }
    except ValueError as exc:
        return _utc_safe_json({"status": "error", "source": "freelancer", "verified": False, "message": str(exc)})
    package_hash = _hash_payload(body)
    body["package_hash"] = package_hash
    body["idempotency_key"] = f"freelancer:freelancer_message:{_hash_payload({'package_hash': package_hash, 'action_intent_id': body['action_intent_id']})}"
    return _utc_safe_json({
        "status": "prepared", "source": "freelancer", "verified": True,
        "connector_prerequisites_satisfied": bool(AUTOMATION_PERMISSION_CONFIRMED and ACCESS_TOKEN),
        "package": body,
    })


@mcp.tool()
def send_freelancer_thread_message(prepared_json: str, authority_ref: str) -> str:
    """Send a prepared message via Freelancer's official thread endpoint after governance gates pass."""
    operation = "send_message"
    package, error = _package_integrity(prepared_json, "freelancer_message")
    if package is None:
        return _invalid_package(operation, error or "invalid prepared package")
    gate = _gate_status(operation)
    if gate is not None:
        return gate
    authority_gate = _authority_gate(authority_ref, operation)
    if authority_gate is not None:
        return authority_gate

    url = f"{FREELANCER_API_BASE.rstrip('/')}/messages/0.1/threads/{package['thread_id']}/messages/"
    try:
        response = requests.post(url, headers=_headers(), data={"message": package["message"]}, timeout=10)
    except requests.RequestException:
        return _utc_safe_json({
            "status": "unknown_outcome", "source": "freelancer", "operation": operation,
            "outcome": "UNKNOWN_OUTCOME", "provider_submission_id": None,
            "provider_thread_id": package["thread_id"], "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"], "retry_safe": False,
            "reconcile_before_retry": True,
            "message": "The message write outcome is unknown; reconcile the thread before any retry.",
        })
    if response.status_code >= 500:
        return _utc_safe_json({
            "status": "unknown_outcome", "source": "freelancer", "operation": operation,
            "outcome": "UNKNOWN_OUTCOME", "provider_submission_id": None,
            "provider_thread_id": package["thread_id"], "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"], "retry_safe": False,
            "reconcile_before_retry": True, "status_code": response.status_code,
        })
    if response.status_code != 200:
        return _utc_safe_json({
            "status": "failed", "source": "freelancer", "operation": operation,
            "outcome": "FAILED", "provider_submission_id": None,
            "provider_thread_id": package["thread_id"], "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"], "retry_safe": False,
            "status_code": response.status_code,
        })
    try:
        payload = response.json()
    except ValueError:
        payload = None
    result = payload.get("result") if isinstance(payload, dict) else None
    message_id = result.get("id") if isinstance(result, dict) else None
    returned_thread_id = result.get("thread_id") if isinstance(result, dict) else None
    if not isinstance(message_id, (str, int)) or not str(message_id).strip():
        return _utc_safe_json({
            "status": "unknown_outcome", "source": "freelancer", "operation": operation,
            "outcome": "UNKNOWN_OUTCOME", "provider_submission_id": None,
            "provider_thread_id": package["thread_id"], "idempotency_key": package["idempotency_key"],
            "package_hash": package["package_hash"], "retry_safe": False,
            "reconcile_before_retry": True,
        })
    return _utc_safe_json({
        "status": "success", "source": "freelancer", "operation": operation,
        "outcome": "SUCCESS", "provider_submission_id": str(message_id),
        "provider_thread_id": str(returned_thread_id) if returned_thread_id is not None else package["thread_id"],
        "idempotency_key": package["idempotency_key"], "package_hash": package["package_hash"],
        "verification_method": "official_api_message_identifier", "amount_committed": 0,
        "retry_safe": False,
    })


@mcp.tool()
def freelancer_governed_connector_status() -> str:
    """Report governed Freelancer connector readiness without exposing credentials."""
    write_ready = bool(AUTOMATION_PERMISSION_CONFIRMED and ACCESS_TOKEN)
    return _utc_safe_json({
        "status": "ok",
        "connector": "freelancer_governed",
        "version": CONNECTOR_VERSION,
        "mode": "governed_official_api_adapter",
        "api_base_hostname": urlparse(FREELANCER_API_BASE).hostname,
        "access_token_configured": bool(ACCESS_TOKEN),
        "automation_permission_confirmed": AUTOMATION_PERMISSION_CONFIRMED,
        "capabilities": {
            "project_search": True,
            "profile_lookup": True,
            "oauth_url_generation": True,
            "bid_preparation": True,
            "bid_submission": write_ready,
            "thread_read": write_ready,
            "message_preparation": True,
            "messaging": write_ready,
            "attachment_upload": False,
            "financial_actions": False,
        },
    })


if __name__ == "__main__":
    mcp.run()
