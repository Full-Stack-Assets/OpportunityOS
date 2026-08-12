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
- Provider-neutral Opportunity Aggregator for verification, classification, conservative dedupe, explicit scoring joins, deterministic ranking, and Top-N shortlist production
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
Marketplace / Opportunity Sources
      │
      ▼
Verified Source Evidence + record_kind
      │
      ▼
Aggregate / Classify / Conservative Dedupe
      │
      ├── service_listing ──► market-intelligence output only
      │
      └── buyer_opportunity
              │
              ▼
      Join Explicit Derived Scoring Inputs
              │
              ▼
      Existing Deterministic Ranker
              │
              ▼
          Top-N Shortlist
              │
              ▼
      [future orchestration boundary]
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

The current Top-N shortlist is analysis output only. It is **not** a bid queue, application queue, WorkOrder queue, fulfillment trigger, or authorization to perform marketplace actions.

Security domains are deliberately separated: source adapters cannot manufacture verified evidence after retrieval failure, seller-service records cannot masquerade as buyer demand, the aggregator cannot create missing scoring facts or external side effects, factories do not authorize themselves, BuildGraph decisions cannot be silently bypassed, and verifier evidence is distinct from factory output.

## Opportunity Aggregator

`packages/core/src/aggregator.ts` is a pure provider-neutral transformation over normalized `MarketplaceOpportunityEvidence[]` plus separately supplied OpportunityOS scoring inputs.

It independently validates source records, isolates `service_listing` records as intelligence, deduplicates buyer opportunities conservatively, joins explicit scoring inputs, and reuses the existing `rankOpportunities()` formula. It does not call marketplace connectors, provider APIs, PostgreSQL, WorkOrder creation, BuildGraph, Trust Kernel authorization, factories, messaging, bidding, purchasing, or payment code.

Exact duplicate selection is deterministic: newest `retrieved_at`, then lexicographically smaller `source_url`, then lower original input index. Cross-platform records and fuzzy/semantic lookalikes are deliberately not merged.

Missing or ambiguous scoring inputs do not invalidate verified buyer evidence. They remain explainable accepted records but are excluded from ranking until exactly one valid scoring row is supplied. Missing expected value remains unknown rather than being fabricated.

## Marketplace source adapters

### Freelancer.com

`connectors/freelancer` is the canonical buyer-demand marketplace adapter. It uses the Freelancer API through a portable Python `MCPServer` built on MCP Python SDK v2 and emits `record_kind: "buyer_opportunity"` records using the source-fact schema in `packages/core/src/source.ts`.

The connector is read-only in this release. It can search projects, retrieve public profile context, generate an OAuth authorization URL, and report its capabilities. It does not submit bids, send messages, accept projects, create/release milestones, make payments, or automatically activate a live OpportunityOS execution path.

### Fiverr

`connectors/fiverr` is a lower-trust public-web discovery adapter for Fiverr seller service listings. Every admitted Fiverr record is `record_kind: "service_listing"`.

Fiverr seller listings may inform competitive analysis, pricing context, market research, or capability positioning, but they cannot satisfy `isBuyerOpportunityEvidence()` and therefore cannot directly enter buyer-opportunity ranking or create a client WorkOrder.

Fiverr retrieval is fail-closed. Network failures, non-success responses, anti-bot/Cloudflare verification pages, selector drift, or structurally unusable responses return zero verified listings. The connector does not attempt to bypass anti-bot controls or use browser-session secrets. Missing prices, currencies, or other values remain unknown rather than being fabricated.

Affiliate candidate URLs are isolated from evidence and ranking. Their parameter semantics are explicitly marked unverified and `affects_ranking` remains false.

## Repository layout

- `packages/core` — deterministic domain logic, source-evidence and record-kind contract, Opportunity Aggregator, ranking, Trust Kernel contracts, BuildGraph gate, factories, verifier, economics
- `packages/postgres` — persistence adapter boundary
- `connectors/freelancer` — read-only Freelancer.com buyer-opportunity source adapter and tests
- `connectors/fiverr` — read-only Fiverr service-listing discovery adapter and tests
- `apps/worker` — simulation-safe WorkOrder worker
- `apps/control-plane` — Next.js operator surface
- `database/migrations` — PostgreSQL canonical schema
- `docs/architecture` — system boundaries, threat model, BuildGraph integration, operations, evidence
- `scripts/smoke.ts` — zero-external-side-effect release smoke check

## Local verification

The TypeScript core can be verified on Node 22:

```bash
npm test
npm run typecheck:local
npm run smoke
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

The complete control-plane build needs npm registry access:

```bash
npm install
npm run typecheck
npm run build
```

## Runtime configuration

Copy `.env.example` into your secret-management system. Do not commit real credentials.

- `DATABASE_URL` — PostgreSQL connection string
- `BUILDGRAPH_BASE_URL` — BuildGraph API base
- `BUILDGRAPH_API_TOKEN` — optional API token when BuildGraph requires authentication
- `OPPORTUNITYOS_EXECUTION_MODE` — must remain `simulation` for this release
- `FREELANCER_API_BASE` — Freelancer API base URL; defaults to the production API in the connector
- `FREELANCER_ACCESS_TOKEN` — optional environment-supplied OAuth access token; never commit it

The Fiverr adapter in this tranche requires no stored Fiverr credential or browser-session secret.

## Deployment boundary

Deployment remains provider-neutral and is not activated by the marketplace-source or aggregator work. Adding the read-only adapters and deterministic shortlist does not activate marketplace writes or live consequential execution. Passing mocked connector tests and deterministic aggregator tests does not claim live public marketplace retrieval or fulfillment success.
