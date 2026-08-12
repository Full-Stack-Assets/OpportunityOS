import json
import logging
import math
import os
from datetime import datetime, timezone
from urllib.parse import quote, urlencode, urlparse

import requests
from mcp.server import MCPServer

mcp = MCPServer("Freelancer Connector")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("freelancer-mcp")

FREELANCER_API_BASE = os.getenv("FREELANCER_API_BASE", "https://www.freelancer.com/api")
ACCESS_TOKEN = os.getenv("FREELANCER_ACCESS_TOKEN", "")
CONNECTOR_VERSION = "1.0.0"


def _validate_query(query: str) -> str:
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-blank string")
    return query.strip()


def _validate_limit(limit: int) -> int:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ValueError("limit must be an integer between 1 and 50")
    return limit


def _validate_username(username: str) -> str:
    if not isinstance(username, str) or not username.strip():
        raise ValueError("username must be a non-blank string")
    return username.strip()


def _validation_error(message: str, *, projects: bool = False) -> str:
    payload = {
        "status": "error",
        "source": "freelancer",
        "verified": False,
        "message": message,
    }
    if projects:
        payload["projects"] = []
    return json.dumps(payload, indent=2)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _source_identifier(value: object) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return str(value)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _source_number(value: object) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return value


def _source_nonnegative_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _source_string(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _source_deadline(value: object) -> str | int | float | None:
    if isinstance(value, str):
        return value.strip() or None
    return _source_number(value)


def _canonical_project_url(project: dict, project_id: str) -> str:
    seo_url = project.get("seo_url")
    if isinstance(seo_url, str) and seo_url.strip():
        return f"https://www.freelancer.com/projects/{seo_url.strip().lstrip('/')}"
    return f"https://www.freelancer.com/projects/{project_id}"


def _skill_names(project: dict) -> list[str]:
    jobs = project.get("jobs")
    if not isinstance(jobs, list):
        return []
    names: list[str] = []
    for job in jobs:
        if isinstance(job, dict):
            name = job.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def _normalize_project(project: dict, retrieved_at: str) -> dict | None:
    if not isinstance(project, dict):
        return None
    project_id = _source_identifier(project.get("id"))
    title = _source_string(project.get("title"))
    if project_id is None or title is None:
        return None

    budget = project.get("budget")
    currency = project.get("currency")
    bid_stats = project.get("bid_stats")

    return {
        "platform": "freelancer",
        "platform_id": project_id,
        "title": title,
        "description": _source_string(project.get("description")),
        "budget_min": _source_number(budget.get("minimum")) if isinstance(budget, dict) else None,
        "budget_max": _source_number(budget.get("maximum")) if isinstance(budget, dict) else None,
        "currency": _source_string(currency.get("code")) if isinstance(currency, dict) else None,
        "bid_count": _source_nonnegative_int(bid_stats.get("bid_count")) if isinstance(bid_stats, dict) else None,
        "skills": _skill_names(project),
        "employer_id": _source_identifier(project.get("owner_id")),
        "deadline": _source_deadline(project.get("deadline")),
        "source_url": _canonical_project_url(project, project_id),
        "retrieved_at": retrieved_at,
        "retrieval_method": "freelancer_official_api",
        "verified": True,
        "raw_source": "freelancer",
    }


def _search_failure(status: str, query: str, message: str, *, status_code: int | None = None) -> str:
    payload = {
        "status": status,
        "source": "freelancer",
        "verified": False,
        "query": query,
        "projects": [],
        "message": message,
    }
    if status_code is not None:
        payload["status_code"] = status_code
    return json.dumps(payload, indent=2)


@mcp.tool()
def search_freelancer_projects(query: str, limit: int = 5) -> str:
    """Search active Freelancer.com projects and return normalized source records."""
    try:
        query = _validate_query(query)
        limit = _validate_limit(limit)
    except ValueError as exc:
        return _validation_error(str(exc), projects=True)

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "FreelancerMCPConnector/1.0",
    }
    if ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {ACCESS_TOKEN}"

    url = f"{FREELANCER_API_BASE.rstrip('/')}/projects/0.1/projects/active/"
    params = {
        "query": query,
        "limit": limit,
        "compact": True,
        "full_description": True,
        "job_details": True,
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
    except requests.RequestException:
        logger.warning("Freelancer project search unavailable due to request failure")
        return _search_failure(
            "unavailable",
            query,
            "Freelancer API request could not be completed.",
        )
    except Exception:
        logger.exception("Unexpected local error during Freelancer project search")
        return _search_failure(
            "error",
            query,
            "Unexpected local error while searching Freelancer projects.",
        )

    if response.status_code != 200:
        return _search_failure(
            "unavailable",
            query,
            "Freelancer API did not return a successful response.",
            status_code=response.status_code,
        )

    try:
        data = response.json()
    except (ValueError, requests.exceptions.JSONDecodeError):
        return _search_failure(
            "invalid_response",
            query,
            "Freelancer API returned a non-JSON or malformed JSON response.",
        )

    if not isinstance(data, dict):
        return _search_failure(
            "invalid_response", query, "Freelancer API response was structurally invalid."
        )
    result = data.get("result")
    if not isinstance(result, dict):
        return _search_failure(
            "invalid_response", query, "Freelancer API response was structurally invalid."
        )
    projects = result.get("projects")
    if not isinstance(projects, list):
        return _search_failure(
            "invalid_response", query, "Freelancer API response was structurally invalid."
        )

    retrieved_at = _utc_now()
    normalized = [
        record
        for project in projects[:limit]
        if (record := _normalize_project(project, retrieved_at)) is not None
    ]
    if projects[:limit] and not normalized:
        return _search_failure(
            "invalid_response", query, "Freelancer API returned no structurally valid projects."
        )

    return json.dumps({
        "status": "success",
        "source": "freelancer",
        "verified": True,
        "query": query,
        "count": len(normalized),
        "projects": normalized,
    }, indent=2)


def _profile_failure(
    status: str,
    username: str,
    message: str,
    *,
    status_code: int | None = None,
) -> str:
    encoded_username = quote(username, safe="")
    payload = {
        "status": status,
        "source": "freelancer",
        "verified": False,
        "username": username,
        "profile_url": f"https://www.freelancer.com/u/{encoded_username}",
        "message": message,
    }
    if status_code is not None:
        payload["status_code"] = status_code
    return json.dumps(payload, indent=2)


@mcp.tool()
def get_freelancer_user_profile(username: str) -> str:
    """Retrieve public profile fields from the Freelancer.com API."""
    try:
        username = _validate_username(username)
    except ValueError as exc:
        return _validation_error(str(exc))

    encoded_username = quote(username, safe="")
    url = f"{FREELANCER_API_BASE.rstrip('/')}/users/0.1/users/"
    params = {
        "usernames[]": [username],
        "compact": True,
        "details": True,
        "country_details": True,
        "location_details": True,
    }
    headers = {"User-Agent": "FreelancerMCPConnector/1.0"}
    if ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {ACCESS_TOKEN}"

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
    except requests.RequestException:
        logger.warning("Freelancer profile lookup unavailable due to request failure")
        return _profile_failure(
            "unavailable", username, "Freelancer API request could not be completed."
        )
    except Exception:
        logger.exception("Unexpected local error during Freelancer profile lookup")
        return _profile_failure(
            "error", username, "Unexpected local error while retrieving Freelancer profile."
        )

    if response.status_code != 200:
        return _profile_failure(
            "unavailable",
            username,
            "Freelancer API did not return a successful response.",
            status_code=response.status_code,
        )

    try:
        payload = response.json()
    except (ValueError, requests.exceptions.JSONDecodeError):
        return _profile_failure(
            "invalid_response", username, "Freelancer API returned malformed JSON."
        )

    if not isinstance(payload, dict) or not isinstance(payload.get("result"), dict):
        return _profile_failure(
            "invalid_response", username, "Freelancer API response was structurally invalid."
        )

    users = payload["result"].get("users")
    if not isinstance(users, dict):
        return _profile_failure(
            "invalid_response", username, "Freelancer API response was structurally invalid."
        )
    if not users:
        return _profile_failure(
            "unavailable", username, "Freelancer API returned no matching user."
        )

    data = next((
        user for user in users.values()
        if isinstance(user, dict) and user.get("username") == username
    ), None)
    if data is None:
        return _profile_failure(
            "invalid_response", username, "Freelancer API returned no verifiable username match."
        )

    location = data.get("location")
    country_name = None
    if isinstance(location, dict):
        country = location.get("country")
        if isinstance(country, dict):
            name = country.get("name")
            if isinstance(name, str):
                country_name = name

    return json.dumps({
        "status": "success",
        "source": "freelancer",
        "verified": True,
        "username": username,
        "display_name": data.get("display_name") if isinstance(data.get("display_name"), str) else None,
        "tagline": data.get("tagline") if isinstance(data.get("tagline"), str) else None,
        "location": country_name,
        "profile_url": f"https://www.freelancer.com/u/{encoded_username}",
        "retrieved_at": _utc_now(),
        "retrieval_method": "freelancer_official_api",
    }, indent=2)


@mcp.tool()
def generate_freelancer_oauth_auth_url(client_id: str, redirect_uri: str) -> str:
    """Generate an encoded Freelancer OAuth authorization URL; no token exchange occurs."""
    if not isinstance(client_id, str) or not client_id.strip():
        return _validation_error("client_id must be a non-blank string")
    if not isinstance(redirect_uri, str) or not redirect_uri.strip():
        return _validation_error("redirect_uri must be a non-blank string")

    params = {
        "client_id": client_id.strip(),
        "response_type": "code",
        "redirect_uri": redirect_uri.strip(),
    }
    auth_url = "https://www.freelancer.com/oauth/authorise?" + urlencode(params)
    return json.dumps({
        "status": "success",
        "source": "freelancer",
        "verified": False,
        "authorization_url": auth_url,
        "instructions": "Open this URL to begin Freelancer OAuth authorization. Token exchange and storage are outside this connector.",
    }, indent=2)


@mcp.tool()
def freelancer_connector_status() -> str:
    """Report read-only connector capabilities without exposing credentials."""
    return json.dumps({
        "status": "ok",
        "connector": "freelancer",
        "version": CONNECTOR_VERSION,
        "mode": "read_only_source_adapter",
        "api_base_hostname": urlparse(FREELANCER_API_BASE).hostname,
        "access_token_configured": bool(ACCESS_TOKEN),
        "capabilities": {
            "project_search": True,
            "profile_lookup": True,
            "oauth_url_generation": True,
            "bid_submission": False,
            "messaging": False,
            "financial_actions": False,
        },
    }, indent=2)


if __name__ == "__main__":
    mcp.run()
