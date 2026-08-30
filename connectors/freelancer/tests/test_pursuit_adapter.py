import json

import freelancer_pursuit_adapter as adapter


class Response:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_inspect_establishes_account_and_project_identity_without_write(monkeypatch):
    monkeypatch.setattr(adapter.source, "ACCESS_TOKEN", "token-present")
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith('/users/0.1/self/'):
            return Response(200, {"result": {"id": 456}})
        return Response(200, {"result": {"projects": [{"id": 123, "title": "Build API", "bid_stats": {"bid_count": 9}}]}})

    monkeypatch.setattr(adapter.requests, "get", fake_get)
    result = json.loads(adapter.inspect_freelancer_bid(123))
    assert result["status"] == "success"
    assert result["verified"] is True
    assert result["account_id"] == "456"
    assert result["project_id"] == "123"
    assert result["external_side_effects"] == 0
    assert len(calls) == 2


def test_inspect_requires_authenticated_token(monkeypatch):
    monkeypatch.setattr(adapter.source, "ACCESS_TOKEN", "")
    result = json.loads(adapter.inspect_freelancer_bid(123))
    assert result["status"] == "auth_required"
    assert result["verified"] is False


def test_bound_verification_rejects_project_or_bidder_mismatch(monkeypatch):
    monkeypatch.setattr(adapter.source, "ACCESS_TOKEN", "token-present")
    monkeypatch.setattr(adapter.requests, "get", lambda *args, **kwargs: Response(200, {
        "result": {"bids": [{"id": 789, "project_id": 999, "bidder_id": 456}]}
    }))
    result = json.loads(adapter.verify_freelancer_bid(789, project_id=123, bidder_id=456))
    assert result["status"] == "executed_unverified"
    assert result["verified"] is False


def test_bound_verification_requires_exact_bid_project_and_bidder(monkeypatch):
    monkeypatch.setattr(adapter.source, "ACCESS_TOKEN", "token-present")
    monkeypatch.setattr(adapter.requests, "get", lambda *args, **kwargs: Response(200, {
        "result": {"bids": [{"id": 789, "project_id": 123, "bidder_id": 456}]}
    }))
    result = json.loads(adapter.verify_freelancer_bid(789, project_id=123, bidder_id=456))
    assert result["status"] == "submitted_verified"
    assert result["verified"] is True
    assert result["external_id"] == "789"
