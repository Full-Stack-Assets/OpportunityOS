# Freelancer.com → OpportunityOS MCP Adapter

A read-only Model Context Protocol source adapter that retrieves Freelancer.com marketplace facts, validates them, and emits normalized OpportunityOS opportunity records.

## Safety and evidence boundary

This connector is intentionally read-only. It does **not** bid, message, accept projects, create or release milestones, make payments, store Freelancer credentials, or perform other account writes.

It also does **not** synthesize fallback projects. If Freelancer cannot be reached, rejects a request, or returns unusable data, the connector returns an explicit failure state with zero opportunities.

`verified: true` means the relevant record was produced from a successful Freelancer API response and passed local structural validation. Missing or malformed optional source values remain `null` or `[]` rather than being fabricated.

## Tools

### `search_freelancer_projects(query, limit=5)`

Searches the configured Freelancer API active-project endpoint and explicitly requests full descriptions plus job/skill details needed by the OpportunityOS normalization layer. `limit` must be an integer from 1 through 50.

Successful normalized records use this shape:

```json
{
  "platform": "freelancer",
  "platform_id": "42",
  "title": "Build a Python data pipeline",
  "description": "Need ETL automation",
  "budget_min": 250,
  "budget_max": 800,
  "currency": "AUD",
  "bid_count": 7,
  "skills": ["Python"],
  "employer_id": "99",
  "deadline": null,
  "source_url": "https://www.freelancer.com/projects/python/build-python-data-pipeline",
  "retrieved_at": "2026-08-12T09:00:00Z",
  "retrieval_method": "freelancer_official_api",
  "verified": true,
  "raw_source": "freelancer"
}
```

### `get_freelancer_user_profile(username)`

Retrieves source-backed public profile fields by querying the official users collection with the requested username in `usernames[]`. A 200 response is only marked verified when `result.users` contains an exact username match. Non-200, empty, network, malformed-JSON, and structurally invalid responses remain unverified and do not claim successful profile retrieval.

### `generate_freelancer_oauth_auth_url(client_id, redirect_uri)`

Builds a URL-encoded Freelancer OAuth authorization URL. It does not exchange, persist, refresh, or return access tokens.

### `freelancer_connector_status()`

Returns connector version, operating mode, configured API hostname, whether an access token is configured as a boolean, and explicit read/write capability flags. It never returns the token itself.

## Environment

```bash
export FREELANCER_API_BASE="https://www.freelancer.com/api"
export FREELANCER_ACCESS_TOKEN="..."  # valid Freelancer OAuth2 token for authenticated API retrieval
```

Keep `FREELANCER_ACCESS_TOKEN` outside source control. Do not place passwords, session cookies, MFA material, payment credentials, or other browser-session secrets in this connector.

## Install

Python 3.10 or newer is required. The connector targets MCP Python SDK v2 (`mcp>=2,<3`) and uses `mcp.server.MCPServer`.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r connectors/freelancer/requirements.txt
```

## Run

```bash
python3 connectors/freelancer/freelancer_mcp_server.py
```

The entry point uses the MCP SDK's default direct-execution transport. Deployment or tunneling can be layered around this portable server without changing the marketplace evidence model.

## Test

```bash
pytest -q connectors/freelancer/tests
python3 -m py_compile connectors/freelancer/freelancer_mcp_server.py
```

Tests mock marketplace HTTP traffic. When the external MCP package is installed—as it is in CI—the registration test calls the real MCPServer tool-discovery API. The test-only shim is used only in constrained local runners where `mcp` is absent.

## Error states

- `success` — upstream response retrieved and validated.
- `unavailable` — upstream request could not be completed or returned a non-success status.
- `invalid_response` — upstream response was malformed or structurally unusable.
- `error` — deterministic local validation error or unexpected local runtime failure.

Search failures always contain `projects: []`. There is no simulated or fabricated project path.

## OpportunityOS boundary

The adapter emits source facts only. `packages/core/src/source.ts` is the matching OpportunityOS evidence contract and rejects unverified records at the source boundary. Derived fit, effort, margin, competition, autonomous-execution feasibility, human-action requirements, and recommended action remain downstream concerns.
