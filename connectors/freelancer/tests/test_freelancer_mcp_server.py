import asyncio
import json
from pathlib import Path
from unittest.mock import Mock

import pytest

import freelancer_mcp_server as server


def test_blank_query_is_rejected():
    payload = json.loads(server.search_freelancer_projects("   "))
    assert payload["status"] == "error"
    assert payload["verified"] is False
    assert payload["projects"] == []


@pytest.mark.parametrize("limit", [0, 51, -1])
def test_search_limit_outside_1_to_50_is_rejected(limit):
    payload = json.loads(server.search_freelancer_projects("python", limit))
    assert payload["status"] == "error"
    assert payload["projects"] == []


def test_blank_username_is_rejected():
    payload = json.loads(server.get_freelancer_user_profile("  "))
    assert payload["status"] == "error"
    assert payload["verified"] is False


def _response(status_code=200, payload=None, json_error=None):
    response = Mock(status_code=status_code)
    if json_error is not None:
        response.json.side_effect = json_error
    else:
        response.json.return_value = payload
    return response


def test_search_success_returns_normalized_verified_records(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": [{
            "id": 42,
            "title": "Build a Python data pipeline",
            "description": "Need ETL automation",
            "currency": {"code": "AUD"},
            "budget": {"minimum": 250, "maximum": 800},
            "bid_stats": {"bid_count": 7},
            "seo_url": "python/build-python-data-pipeline",
            "owner_id": 99,
            "jobs": [{"name": "Python"}],
            "submitdate": 1786500000,
        }]}
    }))
    payload = json.loads(server.search_freelancer_projects("python", 5))
    assert payload["status"] == "success"
    assert payload["source"] == "freelancer"
    assert payload["verified"] is True
    assert payload["count"] == 1
    item = payload["projects"][0]
    assert item["platform"] == "freelancer"
    assert item["platform_id"] == "42"
    assert item["currency"] == "AUD"
    assert item["budget_min"] == 250
    assert item["budget_max"] == 800
    assert item["bid_count"] == 7
    assert item["skills"] == ["Python"]
    assert item["employer_id"] == "99"
    assert item["retrieval_method"] == "freelancer_official_api"
    assert item["verified"] is True
    assert item["raw_source"] == "freelancer"
    assert item["source_url"] == "https://www.freelancer.com/projects/python/build-python-data-pipeline"
    assert item["retrieved_at"].endswith("Z")


def test_search_requests_description_and_job_details(monkeypatch):
    captured = {}

    def fake_get(url, **kwargs):
        captured["params"] = kwargs.get("params")
        return _response(payload={"result": {"projects": []}})

    monkeypatch.setattr(server.requests, "get", fake_get)
    payload = json.loads(server.search_freelancer_projects("python", 5))

    assert payload["status"] == "success"
    assert captured["params"]["full_description"] is True
    assert captured["params"]["job_details"] is True


def test_missing_optional_fields_are_not_fabricated(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": [{"id": 1, "title": "Minimal project", "seo_url": "minimal"}]}
    }))
    item = json.loads(server.search_freelancer_projects("minimal"))["projects"][0]
    assert item["currency"] is None
    assert item["budget_min"] is None
    assert item["budget_max"] is None
    assert item["bid_count"] is None
    assert item["description"] is None
    assert item["skills"] == []
    assert item["employer_id"] is None
    assert item["deadline"] is None


def test_search_non_200_fails_closed(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(status_code=401, payload={}))
    payload = json.loads(server.search_freelancer_projects("python"))
    assert payload["status"] == "unavailable"
    assert payload["source"] == "freelancer"
    assert payload["verified"] is False
    assert payload["projects"] == []
    assert payload["status_code"] == 401
    assert "simulated_results" not in payload


def test_search_network_exception_fails_closed(monkeypatch):
    def boom(*args, **kwargs):
        raise server.requests.RequestException("offline")
    monkeypatch.setattr(server.requests, "get", boom)
    payload = json.loads(server.search_freelancer_projects("python"))
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False
    assert payload["projects"] == []
    assert "offline" not in payload["message"]


def test_search_malformed_json_is_invalid_response(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(json_error=ValueError("bad json")))
    payload = json.loads(server.search_freelancer_projects("python"))
    assert payload["status"] == "invalid_response"
    assert payload["verified"] is False
    assert payload["projects"] == []


def test_search_structurally_invalid_projects_is_invalid_response(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": "not-a-list"}
    }))
    payload = json.loads(server.search_freelancer_projects("python"))
    assert payload["status"] == "invalid_response"
    assert payload["projects"] == []


def test_search_drops_invalid_project_objects_but_keeps_valid_records(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": [
            {"id": None, "title": "Missing ID"},
            {"id": 7, "title": "Valid", "seo_url": "valid"},
            {"id": 8, "title": "   ", "seo_url": "invalid-title"},
        ]}
    }))
    payload = json.loads(server.search_freelancer_projects("python"))
    assert payload["status"] == "success"
    assert payload["count"] == 1
    assert payload["projects"][0]["platform_id"] == "7"


def test_search_all_invalid_project_objects_is_invalid_response(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": [{"id": None, "title": "Missing ID"}]}
    }))
    payload = json.loads(server.search_freelancer_projects("python"))
    assert payload["status"] == "invalid_response"
    assert payload["verified"] is False
    assert payload["projects"] == []


def test_profile_success_is_verified(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {
            "users": {
                "123": {
                    "id": 123,
                    "username": "example-user",
                    "display_name": "Example User",
                    "tagline": "Python specialist",
                    "location": {"country": {"name": "Australia"}},
                }
            }
        }
    }))
    payload = json.loads(server.get_freelancer_user_profile("example-user"))
    assert payload["status"] == "success"
    assert payload["source"] == "freelancer"
    assert payload["verified"] is True
    assert payload["display_name"] == "Example User"
    assert payload["tagline"] == "Python specialist"
    assert payload["location"] == "Australia"


def test_profile_non_200_is_unverified(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(status_code=404, payload={}))
    payload = json.loads(server.get_freelancer_user_profile("missing-user"))
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False
    assert payload["status_code"] == 404
    assert payload["profile_url"].endswith("/u/missing-user")


def test_profile_success_without_matching_user_is_unavailable(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"users": {}}
    }))
    payload = json.loads(server.get_freelancer_user_profile("missing-user"))
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False


def test_profile_network_exception_is_unavailable(monkeypatch):
    def boom(*args, **kwargs):
        raise server.requests.RequestException("sensitive-upstream-detail")
    monkeypatch.setattr(server.requests, "get", boom)
    payload_text = server.get_freelancer_user_profile("example-user")
    payload = json.loads(payload_text)
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False
    assert "sensitive-upstream-detail" not in payload_text


def test_profile_structurally_invalid_result_is_invalid_response(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={"result": []}))
    payload = json.loads(server.get_freelancer_user_profile("example-user"))
    assert payload["status"] == "invalid_response"
    assert payload["verified"] is False


def test_profile_username_uses_official_users_lookup_query(monkeypatch):
    captured = {}

    def fake_get(url, **kwargs):
        captured["url"] = url
        captured["params"] = kwargs.get("params")
        return _response(payload={
            "result": {
                "users": {
                    "123": {"id": 123, "username": "name/with space"}
                }
            }
        })

    monkeypatch.setattr(server.requests, "get", fake_get)
    payload = json.loads(server.get_freelancer_user_profile("name/with space"))

    assert payload["status"] == "success"
    assert captured["url"].endswith("/users/0.1/users/")
    assert captured["params"]["usernames[]"] == ["name/with space"]
    assert captured["params"]["compact"] is True
    assert captured["params"]["details"] is True
    assert captured["params"]["country_details"] is True
    assert captured["params"]["location_details"] is True


def test_oauth_parameters_are_url_encoded():
    payload = json.loads(server.generate_freelancer_oauth_auth_url(
        "client id+1",
        "https://example.test/callback?x=1&next=/a b",
    ))
    url = payload["authorization_url"]
    assert "client_id=client+id%2B1" in url
    assert "response_type=code" in url
    assert "redirect_uri=https%3A%2F%2Fexample.test%2Fcallback%3Fx%3D1%26next%3D%2Fa+b" in url


def test_oauth_blank_inputs_are_rejected():
    payload = json.loads(server.generate_freelancer_oauth_auth_url("  ", "https://example.test/cb"))
    assert payload["status"] == "error"
    assert payload["verified"] is False


def test_connector_status_reports_configuration_without_leaking_token(monkeypatch):
    monkeypatch.setattr(server, "ACCESS_TOKEN", "super-secret-token")
    payload_text = server.freelancer_connector_status()
    payload = json.loads(payload_text)
    assert payload["status"] == "ok"
    assert payload["connector"] == "freelancer"
    assert payload["mode"] == "read_only_source_adapter"
    assert payload["access_token_configured"] is True
    assert payload["api_base_hostname"] == "www.freelancer.com"
    assert payload["capabilities"]["project_search"] is True
    assert payload["capabilities"]["profile_lookup"] is True
    assert payload["capabilities"]["oauth_url_generation"] is True
    assert payload["capabilities"]["bid_submission"] is False
    assert payload["capabilities"]["messaging"] is False
    assert payload["capabilities"]["financial_actions"] is False
    assert "super-secret-token" not in payload_text


def test_no_write_tools_are_defined():
    prohibited = {
        "submit_bid",
        "send_message",
        "accept_project",
        "create_milestone",
        "release_milestone",
        "financial_action",
    }
    assert prohibited.isdisjoint(set(dir(server)))


def test_required_tool_functions_exist():
    required = (
        "search_freelancer_projects",
        "get_freelancer_user_profile",
        "generate_freelancer_oauth_auth_url",
        "freelancer_connector_status",
    )
    for name in required:
        assert callable(getattr(server, name))


def test_required_tools_are_registered_with_mcp():
    tools = asyncio.run(server.mcp.list_tools())
    assert {tool.name for tool in tools} == {
        "search_freelancer_projects",
        "get_freelancer_user_profile",
        "generate_freelancer_oauth_auth_url",
        "freelancer_connector_status",
    }


def test_source_contains_no_simulated_result_path():
    source = Path(server.__file__).read_text(encoding="utf-8")
    assert "simulated_results" not in source
    assert "12345678" not in source
    assert "Expert needed for" not in source


def test_validation_error_does_not_leak_access_token(monkeypatch):
    monkeypatch.setattr(server, "ACCESS_TOKEN", "token-that-must-not-leak")
    payload_text = server.search_freelancer_projects("   ")
    assert "token-that-must-not-leak" not in payload_text


def test_malformed_optional_project_types_are_not_marked_as_source_facts(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": [{
            "id": 9,
            "title": "Typed project",
            "description": ["not", "text"],
            "currency": {"code": 123},
            "budget": {"minimum": "100", "maximum": {"bad": True}},
            "bid_stats": {"bid_count": "7"},
            "owner_id": {"not": "an id"},
            "deadline": {"not": "a deadline"},
            "jobs": [{"name": "Python"}, {"name": 123}],
            "seo_url": "typed-project",
        }]}
    }))

    payload = json.loads(server.search_freelancer_projects("typed"))
    assert payload["status"] == "success"
    item = payload["projects"][0]
    assert item["description"] is None
    assert item["currency"] is None
    assert item["budget_min"] is None
    assert item["budget_max"] is None
    assert item["bid_count"] is None
    assert item["employer_id"] is None
    assert item["deadline"] is None
    assert item["skills"] == ["Python"]


def test_structurally_invalid_project_identifier_is_rejected(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"projects": [{
            "id": {"not": "an identifier"},
            "title": "Invalid id",
        }]}
    }))

    payload = json.loads(server.search_freelancer_projects("invalid"))
    assert payload["status"] == "invalid_response"
    assert payload["verified"] is False
    assert payload["projects"] == []
