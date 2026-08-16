# OpportunityOS

OpportunityOS is a governed opportunity-execution system that discovers and ranks opportunities, compresses them into WorkOrders, requires BuildGraph reuse/duplicate-work preflight, compiles requirements into an execution DAG, routes work to bounded factories, and independently verifies outputs before recording economics or completion.

## Release status

**Current release:** `0.1.0-simulation`

This repository is intentionally fail-closed. It does **not** claim live consequential execution. External side effects remain disabled until a later release has provider-specific activation, authenticated verification, explicit Trust Kernel policy, and evidence-backed acceptance tests.

### Implemented foundation

- Canonical JSON + SHA-256 hashing
- Payload-bound, action-specific, expiring approval contracts
- Append-only chained verification receipts
- Opportunity ranking using capability fit, evidence quality, expected value, effort, and urgency
- Verified marketplace-source evidence contract that rejects unverified records at the source boundary
- Mandatory marketplace `record_kind` classification separating `buyer_opportunity` from `service_listing`
- Read-only Freelancer.com MCP Python SDK v2 source adapter with fail-closed retrieval and `buyer_opportunity` records
- Read-only Fiverr MCP Python SDK v2 source adapter with fail-closed public-web retrieval and `service_listing` records
- Public-demand acquisition primitives with freshness/verification gates, fact-vs-inference separation, conservative deduplication, evidence-gap proof steps, and payload-bound pursuit intents
- Public-demand intelligence for buyer intent, observed economic pain, credibility/scam screening, verified portfolio matching, explainable expected-value ranking, and Priority 0 analysis
- Versioned Demand Query Library with source-specific discovery attribution
- Canonical hash-backed collector receipts with source health, counts, query provenance, and optional receipt chaining
- Read-only GitHub Issues official-API collector with bounded pagination, pull-request exclusion, rate/auth/schema health states, and request-only optional credentials
- Read-only Hacker News official-API collector using bounded Ask/Job/item retrieval plus bounded direct-comment analysis
- Explicit WorkOrder finite-state machine with `NEEDS_YOU`
- Requirements compiler with dependency validation and cycle rejection
- BuildGraph `/v1/preflight` client and fail-closed reuse gate
- Simulation-only Software/Web, Research/Documents, and Automation factory contracts
- Independent artifact checksum verification
- Integer-cent economics that preserves unknown values instead of fabricating them
- PostgreSQL canonical schema and parameterized store boundary
- Separate worker application boundary
- Next.js operator/control-plane scaffold
- Local smoke verifier and CI workflow

## Architecture

```text
Marketplace / Public Demand Sources
      │
      ▼
Verified Source Evidence / Attributed Public Observations
      │
      ├── buyer demand ──► Opportunity / Demand Intelligence
      │
      └── service listing ────► market-intelligence use only
                                 (not buyer-opportunity execution admission)

Verified buyer demand
      │
      ▼
Intent / Pain / Credibility / Portfolio / EV Analysis
      │
      ▼
BuildGraph Preflight ── REUSE/EXTEND/FORK ──► NEEDS_YOU / reuse path
      │ CREATE_NEW
      ▼
WorkOrder Kernel ──► Trust Kernel / Policy Gate
      │
      ▼
Requirements Compiler (DAG)
      │
      ▼
Bounded Factory Worker (simulation only)
      │
      ▼
Independent Verifier ──► Receipt Chain
      │
      ▼
Artifacts + Economics + Telemetry
```

Security domains are deliberately separated: source adapters cannot manufacture verified evidence after retrieval failure, seller-service records cannot masquerade as buyer demand, public collectors cannot authorize source writes, factories do not authorize themselves, BuildGraph decisions cannot be silently bypassed, and verifier evidence is distinct from factory output.

## Marketplace source adapters

### Freelancer.com

`connectors/freelancer` is the canonical buyer-demand marketplace adapter. It uses the Freelancer API through a portable Python `MCPServer` built on MCP Python SDK v2 and emits `record_kind: "buyer_opportunity"` records using the source-fact schema in `packages/core/src/source.ts`.

The connector is read-only in this release. It can search projects, retrieve public profile context, generate an OAuth authorization URL, and report its capabilities. It does not submit bids, send messages, accept projects, create/release milestones, make payments, or automatically activate a live OpportunityOS execution path.

### Fiverr

`connectors/fiverr` is a lower-trust public-web discovery adapter for Fiverr seller service listings. Every admitted Fiverr record is `record_kind: "service_listing"`.

Fiverr seller listings may inform competitive analysis, pricing context, market research, or capability positioning, but they cannot satisfy `isBuyerOpportunityEvidence()` and therefore cannot directly enter buyer-opportunity execution or create a client WorkOrder.

Fiverr retrieval is fail-closed. Network failures, non-success responses, anti-bot/Cloudflare verification pages, selector drift, or structurally unusable responses return zero verified listings. The connector does not attempt to bypass anti-bot controls or use browser-session secrets. Missing prices, currencies, or other values remain unknown rather than being fabricated.

Affiliate candidate URLs are isolated from evidence and ranking. Their parameter semantics are explicitly marked unverified and `affects_ranking` remains false.

## Public demand collectors

`packages/public-demand-collectors` is an isolated provider-access workspace for high-intent public demand. It converts provider-native records into query-attributed `RawPublicDemandObservation` records and collector receipts before the deterministic `packages/core` demand-intelligence pipeline processes them.

### GitHub Issues

The GitHub Issues collector uses the official REST API only. It appends `is:issue state:open` to approved versioned query-family searches, rejects pull requests and non-open issues, validates source identity/schema, preserves repository and issue provenance, and supports bounded pagination.

An optional GitHub token may be supplied by the runtime host for authenticated API access and rate limits. The token is used only to construct the outbound request header. It is not returned, logged, persisted, placed in observations, or hashed into collector receipts.

Authentication, rate-limit, network, and top-level schema failures fail closed with zero verified observations. There is no browser/HTML scraping fallback.

### Hacker News

The Hacker News collector uses the official Hacker News Firebase API only. It reads bounded Ask/Job story lists and item records, then applies the versioned Demand Query Library locally. Direct child comments may be inspected within a configured bound; recursive comment crawling is not implemented.

Deleted, dead, malformed, unavailable, and non-matching items are rejected instead of being replaced with plausible synthetic records. Hacker News requires no credential in this implementation.

See `docs/public-demand-collectors.md` for source-health states, bounds, query attribution, collector receipt semantics, and runtime contracts.

Live Reddit, GitHub Discussions, DEV, Discourse, and Indie Hackers collectors are **not** implemented in this tranche and must not be inferred from the public-demand source catalog alone.

## Repository layout

- `packages/core` — deterministic domain logic, public-demand/query/receipt contracts, source-evidence and record-kind contract, Trust Kernel contracts, BuildGraph gate, factories, verifier, economics
- `packages/postgres` — persistence adapter boundary
- `packages/public-demand-collectors` — read-only official-API GitHub Issues and Hacker News public-demand collectors and tests
- `connectors/freelancer` — read-only Freelancer.com buyer-opportunity source adapter and tests
- `connectors/fiverr` — read-only Fiverr service-listing discovery adapter and tests
- `apps/worker` — simulation-safe WorkOrder worker
- `apps/control-plane` — Next.js operator surface
- `database/migrations` — PostgreSQL canonical schema
- `docs/architecture` — system boundaries, threat model, BuildGraph integration, operations, evidence
- `scripts/smoke.ts` — zero-external-side-effect release smoke check

## Local verification

After installing workspace dependencies, verify all TypeScript behavioral contracts, including the public-demand collector package, with:

```bash
npm test
npm run typecheck
npm run smoke
npm run build
```

Verify the Freelancer connector with:

```bash
pip install -r connectors/freelancer/requirements.txt
pytest -q connectors/freelancer/tests
python3 -m py_compile connectors/freelancer/freelancer_mcp_server.py
```

Verify the Fiverr connector with:

```bash
pip install -r connectors/fiverr/requirements.txt
pytest -q connectors/fiverr/tests
python3 -m py_compile connectors/fiverr/fiverr_mcp_server.py
```

## Runtime configuration

Copy `.env.example` into your secret-management system. Do not commit real credentials.

- `DATABASE_URL` — PostgreSQL connection string
- `BUILDGRAPH_BASE_URL` — BuildGraph API base
- `BUILDGRAPH_API_TOKEN` — optional API token when BuildGraph requires authentication
- `OPPORTUNITYOS_EXECUTION_MODE` — must remain `simulation` for this release
- `FREELANCER_API_BASE` — Freelancer API base URL; defaults to the production API in the connector
- `FREELANCER_ACCESS_TOKEN` — optional environment-supplied OAuth access token; never commit it
- GitHub public-demand token — optional runtime-supplied GitHub credential passed into `collectGitHubIssues()`; the collector package does not load or persist it automatically

The Fiverr and Hacker News adapters in this tranche require no stored provider credential or browser-session secret.

## Deployment boundary

Deployment remains provider-neutral and is not activated by this release. Adding read-only Freelancer, Fiverr, GitHub Issues, and Hacker News discovery does not activate provider writes, applications, outreach, proposal submission, contract acceptance, payments, or live consequential execution. Passing fixture-backed collector/parser tests proves deterministic contracts against controlled provider responses; it does not claim that every live upstream source is currently healthy or authenticated in a production runtime.