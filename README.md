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
- Read-only Freelancer.com FastMCP source adapter with fail-closed retrieval and no simulated opportunities
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
Opportunity Sources
      │
      ▼
Verified Source Evidence ──► Opportunity Registry ──► Capability Ranking
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

Security domains are deliberately separated: source adapters cannot manufacture verified evidence after retrieval failure, factories do not authorize themselves, BuildGraph decisions cannot be silently bypassed, and verifier evidence is distinct from factory output.

## Marketplace source adapters

`connectors/freelancer` is the first canonical marketplace-source adapter. It uses the Freelancer API through a portable Python FastMCP server and emits the source-fact schema defined by `packages/core/src/source.ts`.

The connector is read-only in this release. It can search projects, retrieve public profile context, generate an OAuth authorization URL, and report its capabilities. It does not submit bids, send messages, accept projects, create/release milestones, make payments, or automatically activate a live OpportunityOS execution path.

Failed, rejected, malformed, or structurally unusable marketplace responses produce explicit unverified failure states and zero opportunities. No synthetic fallback project is admitted as source evidence.

## Repository layout

- `packages/core` — deterministic domain logic, source-evidence contract, Trust Kernel contracts, BuildGraph gate, factories, verifier, economics
- `packages/postgres` — persistence adapter boundary
- `connectors/freelancer` — read-only Freelancer.com FastMCP source adapter and tests
- `apps/worker` — simulation-safe WorkOrder worker
- `apps/control-plane` — Next.js operator surface
- `database/migrations` — PostgreSQL canonical schema
- `docs/architecture` — system boundaries, threat model, BuildGraph integration, operations, evidence
- `scripts/smoke.ts` — zero-external-side-effect release smoke check

## Local verification

The dependency-free TypeScript core can be verified on Node 22 without installing packages:

```bash
npm test
npm run typecheck:local
npm run smoke
```

The Freelancer connector is verified separately:

```bash
pip install -r connectors/freelancer/requirements.txt
pytest -q connectors/freelancer/tests
python3 -m py_compile connectors/freelancer/freelancer_mcp_server.py
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

## Deployment boundary

Deployment remains provider-neutral and is not activated by this release. Adding the read-only Freelancer source adapter does not activate production deployment, marketplace writes, or live consequential execution.
