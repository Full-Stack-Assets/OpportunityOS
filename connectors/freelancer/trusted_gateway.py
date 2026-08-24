import json
import sys
from typing import Any

import freelancer_mcp_server as server


def dispatch(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"status": "failed", "verified": False, "message": "Gateway payload must be an object."}

    operation = payload.get("operation")
    if operation == "inspect_bid":
        raw = server.inspect_freelancer_bid(payload.get("project_id"))
    elif operation == "submit_bid":
        raw = server.submit_freelancer_bid(
            project_id=payload.get("project_id"),
            bidder_id=payload.get("bidder_id"),
            amount=payload.get("amount"),
            period=payload.get("period"),
            milestone_percentage=payload.get("milestone_percentage"),
            description=payload.get("description"),
            approval_ref=payload.get("approval_ref"),
            idempotency_key=payload.get("idempotency_key"),
        )
    elif operation == "verify_bid":
        raw = server.verify_freelancer_bid(
            payload.get("bid_id"),
            project_id=payload.get("project_id"),
            bidder_id=payload.get("bidder_id"),
        )
    else:
        return {"status": "failed", "verified": False, "message": "Unsupported trusted gateway operation."}

    try:
        result = json.loads(raw)
    except (TypeError, ValueError):
        return {"status": "failed", "verified": False, "message": "Internal adapter returned malformed JSON."}
    if not isinstance(result, dict):
        return {"status": "failed", "verified": False, "message": "Internal adapter returned invalid payload."}
    return result


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (TypeError, ValueError, json.JSONDecodeError):
        json.dump({"status": "failed", "verified": False, "message": "Malformed gateway request."}, sys.stdout)
        return 2

    result = dispatch(payload)
    json.dump(result, sys.stdout)
    return 0 if result.get("status") not in {"failed", "error"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
