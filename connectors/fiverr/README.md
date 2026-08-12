# Fiverr.com → OpportunityOS MCP Adapter

A read-only, lower-trust marketplace discovery adapter that retrieves public Fiverr seller service listings and normalizes only source-backed facts for OpportunityOS.

## Evidence boundary

Fiverr records are classified as `record_kind: "service_listing"`. They are seller-supply records, not buyer-posted client opportunities.

A `service_listing` may support competitive analysis, pricing context, market research, and capability-gap discovery. It must not directly create a client WorkOrder or satisfy buyer-opportunity execution admission. That distinction is enforced in the shared `packages/core/src/source.ts` evidence contract.

The connector never synthesizes fallback listings. If public Fiverr retrieval is blocked, returns a non-success response, produces a Cloudflare/anti-bot page, or no trustworthy listing cards can be parsed, the connector fails closed with zero verified listings.

## Runtime and tools

The connector targets MCP Python SDK v2 (`mcp>=2,<3`) and uses `mcp.server.MCPServer`.

### `search_fiverr_listings(query, limit=5)`

Searches Fiverr's public web surface with a bounded request timeout. A verified result requires an actually retrieved listing card with a non-blank title and a canonical Fiverr seller/gig URL.

When a source listing ID is available it is preserved. Otherwise, the connector derives a deterministic SHA-256 identity from the canonical verified listing URL. Missing price or currency values remain `null`; they are never replaced with plausible defaults.

### `get_fiverr_listing_details(url)`

Accepts only canonical `https://www.fiverr.com/<seller>/<gig>`-shaped listing URLs. It reports success only when public retrieval succeeds and a source-backed listing title can be verified. Blocked, malformed, non-success, or unsupported responses remain unverified.

### `generate_fiverr_affiliate_link(url, affiliate_id)`

Constructs an affiliate candidate URL only for a validated Fiverr listing path. The returned affiliate format is explicitly marked `unverified` and `affects_ranking: false`.

Affiliate logic is not marketplace evidence and cannot influence OpportunityOS fit, ranking, value, or execution decisions.

### `fiverr_connector_status()`

Reports connector version, mode, health posture, and explicit capabilities. `buyer_opportunity_discovery`, messaging, purchasing, and financial actions are false in this tranche.

The default health posture is `degraded` because public-web retrieval can be blocked or changed independently of the connector.

## Safety boundary

This connector does **not**:

- bypass Cloudflare or anti-bot controls;
- use browser cookies or authenticated sessions;
- store passwords, MFA material, payment credentials, or session secrets;
- send Fiverr messages;
- purchase gigs or create orders;
- perform checkout or financial actions;
- treat seller service listings as buyer demand;
- fabricate titles, prices, currencies, sellers, URLs, reviews, or delivery times.

## Error states

- `success` — source response was retrieved and the relevant record passed structural validation.
- `unavailable` — the public request failed, returned a non-success status, or was blocked by anti-bot verification.
- `invalid_response` — a response was retrieved but no trustworthy listing structure could be admitted.
- `unsupported` — detail retrieval completed but did not expose enough source-backed detail to verify a listing.
- `error` — deterministic local input validation or unexpected local runtime failure.

Search failures always return `listings: []` and `verified: false`.

## Install

Python 3.10 or newer is required.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r connectors/fiverr/requirements.txt
```

## Run

```bash
python3 connectors/fiverr/fiverr_mcp_server.py
```

## Verify

```bash
pytest -q connectors/fiverr/tests
python3 -m py_compile connectors/fiverr/fiverr_mcp_server.py
```

The automated suite mocks marketplace HTTP responses. Passing tests prove parser/error/boundary behavior; they do not claim that live public Fiverr retrieval is currently available or stable.
