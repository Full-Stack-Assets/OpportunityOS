import json


def test_bid_submission_is_disabled_by_default(connector, monkeypatch):
    monkeypatch.setattr(connector, "LIVE_WRITES_ENABLED", False)
    monkeypatch.setattr(connector, "ACCESS_TOKEN", "token-present")
    result = json.loads(connector.submit_freelancer_bid(
        project_id=123,
        bidder_id=456,
        amount=100.0,
        period=7,
        milestone_percentage=100,
        description="Proposal",
        approval_ref="approval://1",
        idempotency_key="idem-1",
    ))
    assert result["status"] == "needs_human_auth"
    assert result["verified"] is False


def test_bid_submission_requires_token_approval_and_idempotency(connector, monkeypatch):
    monkeypatch.setattr(connector, "LIVE_WRITES_ENABLED", True)
    monkeypatch.setattr(connector, "ACCESS_TOKEN", "")
    result = json.loads(connector.submit_freelancer_bid(123, 456, 100.0, 7, 100, "Proposal", "approval://1", "idem-1"))
    assert result["status"] == "auth_required"

    monkeypatch.setattr(connector, "ACCESS_TOKEN", "token-present")
    result = json.loads(connector.submit_freelancer_bid(123, 456, 100.0, 7, 100, "Proposal", "", "idem-1"))
    assert result["status"] == "error"
    result = json.loads(connector.submit_freelancer_bid(123, 456, 100.0, 7, 100, "Proposal", "approval://1", ""))
    assert result["status"] == "error"


def test_successful_bid_write_remains_unverified_until_reconciled(connector, monkeypatch):
    monkeypatch.setattr(connector, "LIVE_WRITES_ENABLED", True)
    monkeypatch.setattr(connector, "ACCESS_TOKEN", "token-present")

    class Response:
        status_code = 200
        def json(self):
            return {"result": {"id": 789, "project_id": 123, "bidder_id": 456}}

    captured = {}
    def fake_post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return Response()

    monkeypatch.setattr(connector.requests, "post", fake_post)
    result = json.loads(connector.submit_freelancer_bid(123, 456, 100.0, 7, 100, "Proposal", "approval://1", "idem-1"))
    assert result["status"] == "executed_unverified"
    assert result["verified"] is False
    assert result["external_id"] == "789"
    assert captured["url"].endswith("/projects/0.1/bids/")
    assert captured["json"]["project_id"] == 123
    assert "Authorization" in captured["headers"]


def test_platform_rejection_does_not_claim_submission(connector, monkeypatch):
    monkeypatch.setattr(connector, "LIVE_WRITES_ENABLED", True)
    monkeypatch.setattr(connector, "ACCESS_TOKEN", "token-present")

    class Response:
        status_code = 403
        def json(self):
            return {"message": "Bid not allowed", "error_code": "BID_NOT_ALLOWED"}

    monkeypatch.setattr(connector.requests, "post", lambda *args, **kwargs: Response())
    result = json.loads(connector.submit_freelancer_bid(123, 456, 100.0, 7, 100, "Proposal", "approval://1", "idem-1"))
    assert result["status"] == "rejected_by_platform"
    assert result["verified"] is False
