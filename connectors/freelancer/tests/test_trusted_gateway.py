import json

import trusted_gateway as gateway


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

    def fake_verify(bid_id):
        captured["bid_id"] = bid_id
        return json.dumps({
            "status": "submitted_verified",
            "verified": True,
            "external_id": str(bid_id),
            "evidence_refs": [f"freelancer-api://bid/{bid_id}"],
        })

    monkeypatch.setattr(gateway.server, "verify_freelancer_bid", fake_verify)
    result = gateway.dispatch({"operation": "verify_bid", "bid_id": 789})

    assert captured == {"bid_id": 789}
    assert result["status"] == "submitted_verified"
    assert result["verified"] is True


def test_dispatch_rejects_unsupported_operation_without_touching_adapter(monkeypatch):
    monkeypatch.setattr(gateway.server, "submit_freelancer_bid", lambda **kwargs: (_ for _ in ()).throw(AssertionError("must not submit")))
    monkeypatch.setattr(gateway.server, "verify_freelancer_bid", lambda bid_id: (_ for _ in ()).throw(AssertionError("must not verify")))

    result = gateway.dispatch({"operation": "delete_account"})
    assert result == {
        "status": "failed",
        "verified": False,
        "message": "Unsupported trusted gateway operation.",
    }


def test_dispatch_fails_closed_on_malformed_internal_adapter_payload(monkeypatch):
    monkeypatch.setattr(gateway.server, "verify_freelancer_bid", lambda bid_id: "not-json")
    result = gateway.dispatch({"operation": "verify_bid", "bid_id": 789})
    assert result["status"] == "failed"
    assert result["verified"] is False


def test_gateway_module_does_not_register_new_mcp_tools():
    # The trusted gateway is intentionally an internal stdio boundary. Its operations
    # must not be independently exposed as MCP tools beyond the connector's governed API.
    assert not hasattr(gateway, "mcp")
