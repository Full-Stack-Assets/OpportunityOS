import json

import pytest

import freelancer_mcp_server as server


def _response(status_code=200, payload=None):
    class Response:
        def __init__(self):
            self.status_code = status_code

        def json(self):
            return payload

    return Response()


def _prepared_bid():
    return server.prepare_freelancer_bid(
        project_id=42,
        bidder_id=7,
        description="I can deliver the requested API integration with explicit verification milestones.",
        amount=500,
        period=7,
        milestone_percentage=100,
        action_intent_id="action:bid:42",
        listing_fingerprint="listing:fingerprint:42",
    )


def test_prepare_bid_is_local_deterministic_and_does_not_require_credentials(monkeypatch):
    assert callable(server.prepare_freelancer_bid)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "")
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", False)
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: pytest.fail("prepare must not call network"))
    monkeypatch.setattr(server.requests, "post", lambda *a, **k: pytest.fail("prepare must not call network"))

    first = json.loads(_prepared_bid())
    second = json.loads(_prepared_bid())
    assert first["status"] == "prepared"
    assert first["package"]["kind"] == "freelancer_bid"
    assert first["package"]["project_id"] == "42"
    assert first["package"]["bidder_id"] == "7"
    assert first["package"]["package_hash"] == second["package"]["package_hash"]
    assert first["package"]["idempotency_key"] == second["package"]["idempotency_key"]
    assert first["connector_prerequisites_satisfied"] is False


def test_submit_bid_is_permission_gated_before_any_network_call(monkeypatch):
    assert callable(server.submit_freelancer_bid)
    prepared = _prepared_bid()
    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", False)
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: pytest.fail("permission gate must precede network"))
    monkeypatch.setattr(server.requests, "post", lambda *a, **k: pytest.fail("permission gate must precede network"))

    result = json.loads(server.submit_freelancer_bid(prepared, "canon:approval:bid:42"))
    assert result["status"] == "permission_required"
    assert result["outcome"] == "ESCALATED"
    assert result["retry_safe"] is False


def test_submit_bid_requires_access_token_and_payload_bound_authority(monkeypatch):
    prepared = _prepared_bid()
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", True)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "")
    no_token = json.loads(server.submit_freelancer_bid(prepared, "canon:approval:bid:42"))
    assert no_token["status"] == "auth_required"

    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    no_authority = json.loads(server.submit_freelancer_bid(prepared, "   "))
    assert no_authority["status"] == "authority_required"


def test_submit_bid_reconciles_existing_bid_before_posting(monkeypatch):
    prepared = _prepared_bid()
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", True)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={
        "result": {"bids": [{"id": 9001, "project_id": 42, "bidder_id": 7}]}
    }))
    monkeypatch.setattr(server.requests, "post", lambda *a, **k: pytest.fail("existing bid must prevent duplicate post"))

    result = json.loads(server.submit_freelancer_bid(prepared, "canon:approval:bid:42"))
    assert result["status"] == "verified_noop"
    assert result["outcome"] == "VERIFIED_NOOP"
    assert result["provider_submission_id"] == "9001"
    assert result["amount_committed"] == 0


def test_submit_bid_posts_to_official_api_only_after_all_gates(monkeypatch):
    prepared = _prepared_bid()
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", True)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    captured = {}

    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={"result": {"bids": []}}))

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs["headers"]
        captured["json"] = kwargs["json"]
        return _response(payload={"result": {"id": 1234, "project_id": 42, "bidder_id": 7}})

    monkeypatch.setattr(server.requests, "post", fake_post)
    result = json.loads(server.submit_freelancer_bid(prepared, "canon:approval:bid:42"))
    assert result["status"] == "success"
    assert result["outcome"] == "SUCCESS"
    assert result["provider_submission_id"] == "1234"
    assert captured["url"].endswith("/projects/0.1/bids/")
    assert captured["headers"]["Authorization"] == "Bearer configured-token"
    assert captured["json"]["project_id"] == 42
    assert captured["json"]["bidder_id"] == 7
    assert captured["json"]["amount"] == 500


def test_submit_bid_unknown_network_outcome_requires_reconciliation_before_retry(monkeypatch):
    prepared = _prepared_bid()
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", True)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(payload={"result": {"bids": []}}))

    def fail_post(*args, **kwargs):
        raise server.requests.RequestException("connection closed")

    monkeypatch.setattr(server.requests, "post", fail_post)
    result = json.loads(server.submit_freelancer_bid(prepared, "canon:approval:bid:42"))
    assert result["status"] == "unknown_outcome"
    assert result["outcome"] == "UNKNOWN_OUTCOME"
    assert result["retry_safe"] is False
    assert result["reconcile_before_retry"] is True
    assert "connection closed" not in json.dumps(result)


def test_authenticated_thread_read_and_message_send_are_permission_gated(monkeypatch):
    assert callable(server.list_freelancer_threads)
    assert callable(server.prepare_freelancer_message)
    assert callable(server.send_freelancer_thread_message)

    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", False)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: pytest.fail("permission gate must precede thread read"))
    threads = json.loads(server.list_freelancer_threads())
    assert threads["status"] == "permission_required"

    prepared = server.prepare_freelancer_message(
        thread_id=88,
        message="Thanks for the invitation. I can provide a scoped implementation plan.",
        action_intent_id="action:message:88",
    )
    monkeypatch.setattr(server.requests, "post", lambda *a, **k: pytest.fail("permission gate must precede message write"))
    sent = json.loads(server.send_freelancer_thread_message(prepared, "canon:approval:message:88"))
    assert sent["status"] == "permission_required"


def test_message_send_uses_official_thread_endpoint_and_returns_receipt_fields(monkeypatch):
    monkeypatch.setattr(server, "AUTOMATION_PERMISSION_CONFIRMED", True)
    monkeypatch.setattr(server, "ACCESS_TOKEN", "configured-token")
    prepared = server.prepare_freelancer_message(
        thread_id=88,
        message="Thanks for the invitation. I can provide a scoped implementation plan.",
        action_intent_id="action:message:88",
    )
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["data"] = kwargs["data"]
        return _response(payload={"result": {"id": 777, "thread_id": 88}})

    monkeypatch.setattr(server.requests, "post", fake_post)
    sent = json.loads(server.send_freelancer_thread_message(prepared, "canon:approval:message:88"))
    assert sent["status"] == "success"
    assert sent["outcome"] == "SUCCESS"
    assert sent["provider_submission_id"] == "777"
    assert sent["provider_thread_id"] == "88"
    assert captured["url"].endswith("/messages/0.1/threads/88/messages/")
    assert "message" in captured["data"]
