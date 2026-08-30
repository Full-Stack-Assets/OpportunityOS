import json

import trusted_gateway as gateway


def test_dispatch_inspect_bid_is_read_only(monkeypatch):
    captured = {}

    def fake_inspect(project_id):
        captured["project_id"] = project_id
        return json.dumps({"status": "success", "verified": True, "account_id": "456", "project_id": "123"})

    monkeypatch.setattr(gateway.server, "inspect_freelancer_bid", fake_inspect)
    result = gateway.dispatch({"operation": "inspect_bid", "project_id": 123, "unexpected": "ignored"})
    assert captured == {"project_id": 123}
    assert result["verified"] is True


def test_dispatch_submit_bid_forwards_only_expected_fields(monkeypatch):
    captured = {}

    def fake_submit(**kwargs):
        captured.update(kwargs)
        return json.dumps({"status": "executed_unverified", "verified": False, "external_id": "789"})

    monkeypatch.setattr(gateway.server, "submit_freelancer_bid", fake_submit)
    result = gateway.dispatch({
        "operation": "submit_bid",
        "project_id": 123,
        "bidder_id": 456,
        "amount": 100,
        "period": 7,
        "milestone_percentage": 100,
        "description": "Proposal",
        "approval_ref": "approval://123",
        "idempotency_key": "idem-123",
        "unexpected": "must-not-cross-boundary",
    })

    assert result["status"] == "executed_unverified"
    assert captured == {
        "project_id": 123,
        "bidder_id": 456,
        "amount": 100,
        "period": 7,
        "milestone_percentage": 100,
        "description": "Proposal",
        "approval_ref": "approval://123",
        "idempotency_key": "idem-123",
    }


def test_dispatch_verify_bid_is_separate_from_submission(monkeypatch):
    captured = {}

    def fake_verify(bid_id, project_id=None, bidder_id=None):
        captured.update({"bid_id": bid_id, "project_id": project_id, "bidder_id": bidder_id})
        return json.dumps({
            "status": "submitted_verified",
            "verified": True,
            "external_id": str(bid_id),
            "evidence_refs": [f"freelancer-api://bid/{bid_id}"],
        })

    monkeypatch.setattr(gateway.server, "verify_freelancer_bid", fake_verify)
    result = gateway.dispatch({"operation": "verify_bid", "bid_id": 789, "project_id": 123, "bidder_id": 456})

    assert captured == {"bid_id": 789, "project_id": 123, "bidder_id": 456}
    assert result["status"] == "submitted_verified"
    assert result["verified"] is True


def test_dispatch_rejects_unsupported_operation_without_touching_adapter(monkeypatch):
    monkeypatch.setattr(gateway.server, "submit_freelancer_bid", lambda **kwargs: (_ for _ in ()).throw(AssertionError("must not submit")))
    monkeypatch.setattr(gateway.server, "verify_freelancer_bid", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not verify")))

    result = gateway.dispatch({"operation": "delete_account"})
    assert result == {
        "status": "failed",
        "verified": False,
        "message": "Unsupported trusted gateway operation.",
    }


def test_dispatch_fails_closed_on_malformed_internal_adapter_payload(monkeypatch):
    monkeypatch.setattr(gateway.server, "verify_freelancer_bid", lambda *args, **kwargs: "not-json")
    result = gateway.dispatch({"operation": "verify_bid", "bid_id": 789})
    assert result["status"] == "failed"
    assert result["verified"] is False


def test_gateway_module_does_not_register_new_mcp_tools():
    assert not hasattr(gateway, "mcp")
