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
- Commercial Intelligence Engine with structured economic-value semantics, verified BuildGraph cross-match, evidence-driven eligibility, P0/P0-Critical classification, uncalibrated winability, pursuit economics, revalidation, and Critical Investigation Packets
- Evidence-backed commercial investigation task resolution with `READY_FOR_HUMAN_REVIEW` as a non-authorizing investigation state
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
Commercial Intelligence
      │
      ├── Economic amount semantics
      ├── Verified BuildGraph capability proof
      ├── Eligibility
      ├── Contract-value / pursuit economics
      ├── P0 / P0-Critical policy
      ├── Revalidation
      └── Critical Investigation Packet
      │
      ▼
READY_FOR_HUMAN_REVIEW / NOT_READY
      │
      X  no external action authority
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

Security domains are deliberately separated: source adapters cannot manufacture verified evidence after retrieval failure, seller-service records cannot masquerade as buyer demand, public collectors cannot authorize source writes, commercial criticality cannot authorize outreach, factories do not authorize themselves, BuildGraph decisions cannot be silently bypassed, and verifier evidence is distinct from factory output.

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

## Commercial Intelligence Engine

The Commercial Intelligence Engine is a deterministic, read-only layer in `packages/core`. It converts verified demand plus caller-supplied evidence into a `CriticalInvestigationPacket` and stops before any external action.

### Economic semantics

The engine separates:

- observed procurement budget/contract evidence
- observed economic exposure such as recoverable loss
- defensible contract-value estimates
- modeled expected pursuit value

A verified `$1.4M` recoverable loss remains `$1.4M` of economic exposure. It does not become a `$1.4M` contract without procurement-pricing evidence. A single verified `$1.4M` budget is treated as a ceiling, so expected contract value remains unknown unless fixed-contract or verified range evidence supports it.

### P0-Critical policy

After source verification, credibility, and hard eligibility gates:

- verified USD budget/fixed-contract/range maximum of at least **$1,000,000** becomes `P0_CRITICAL / BUDGET`
- verified explicitly recoverable USD loss of at least **$1,000,000** becomes `P0_CRITICAL / RECOVERABLE_LOSS`

P0-Critical means mandatory investigation. It never authorizes pursuit by itself.

Ordinary P0 can also be inherited from upstream `PRIORITY_0` or produced from at least `$100,000` of verified explicit budget when buyer intent and credibility are each at least `0.70`.

### BuildGraph, eligibility, winability, and revalidation

Commercial capability matching accepts only verified BuildGraph project/capability/artifact evidence with evidence references. Missing proof becomes `EVIDENCE_GAP` rather than a fabricated match.

Eligibility preserves `UNKNOWN` for unstated requirements and requires evidence for passing/failing claims. Hard evidence-backed failures can produce `DISQUALIFIED`.

Win probability is explicitly `UNCALIBRATED_V1`. Unknown factors lower model-input confidence instead of counting as zero.

Revalidation windows are:

- P0-Critical: 6 hours
- P0: 24 hours
- Strong: 72 hours
- Monitor: 7 days

Commercial priority and freshness are separate. A stale seven-figure signal may remain P0-Critical while being blocked from human-review readiness until it is revalidated.

### Critical Investigation Packet

Proof tasks are deterministic and may require source revalidation, capability proof, eligibility verification, value-semantics resolution, or opportunity falsification.

Task resolution is evidence-backed:

```ts
interface InvestigationTaskResolution {
  id: string;
  evidenceRefs: string[];
}
```

A bare task ID or empty evidence list cannot unlock readiness.

`READY_FOR_HUMAN_REVIEW` is possible only after all deterministic gates and proof tasks are satisfied. Even then:

```text
externalActionAllowed = false
```

See `docs/commercial-intelligence-engine.md` for the complete runtime contract and canonical `$1.4M` acceptance cases.

## Repository layout

- `packages/core` — deterministic domain logic, public-demand/query/receipt contracts, commercial intelligence, source-evidence and record-kind contracts, Trust Kernel contracts, BuildGraph gate, factories, verifier, economics
- `packages/postgres` — persistence adapter boundary
- `packages/public-demand-collectors` — read-only official-API GitHub Issues and Hacker News public-demand collectors and tests
- `connectors/freelancer` — read-only Freelancer.com buyer-opportunity source adapter and tests
- `connectors/fiverr` — read-only Fiverr service-listing discovery adapter and tests
- `apps/worker` — simulation-safe WorkOrder worker
- `apps/control-plane` — Next.js operator surface
- `database/migrations` — PostgreSQL canonical schema
- `docs/architecture` — system boundaries, threat model, BuildGraph integration, operations, evidence
- `docs/commercial-intelligence-engine.md` — Commercial Intelligence Engine runtime contract, policy thresholds, revalidation, and authority boundary
- `docs/ma` — carve-out M&A diligence materials (not a claim of live execution, customers, or revenue)
- `scripts/smoke.ts` — zero-external-side-effect release smoke check
- `scripts/buyer-demo.ts` — simulation WorkOrder plus non-authorizing P0-Critical investigation packet

## Local verification

After installing workspace dependencies, verify all TypeScript behavioral contracts, including the public-demand collector package and Commercial Intelligence Engine, with:

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

Deployment remains provider-neutral and is not activated by this release. Adding read-only Freelancer, Fiverr, GitHub Issues, Hacker News discovery, and deterministic commercial intelligence does not activate provider writes, applications, outreach, proposal submission, contract acceptance, payments, or live consequential execution. Passing fixture-backed collector/parser/commercial-intelligence tests proves deterministic contracts against controlled evidence; it does not claim that every live upstream source or BuildGraph integration is currently healthy or authenticated in a production runtime.