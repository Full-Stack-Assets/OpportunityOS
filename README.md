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
Opportunity Registry ──► Capability Ranking
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

Security domains are deliberately separated: factories do not authorize themselves, BuildGraph decisions cannot be silently bypassed, and verifier evidence is distinct from factory output.

## Repository layout

- `packages/core` — deterministic domain logic, Trust Kernel contracts, BuildGraph gate, factories, verifier, economics
- `packages/postgres` — persistence adapter boundary
- `apps/worker` — simulation-safe WorkOrder worker
- `apps/control-plane` — Next.js operator surface
- `database/migrations` — PostgreSQL canonical schema
- `docs/architecture` — system boundaries, threat model, BuildGraph integration, operations, evidence
- `scripts/smoke.ts` — zero-external-side-effect release smoke check

## Local verification

The dependency-free core can be verified on Node 22 without installing packages:

```bash
npm test
npm run typecheck:local
npm run smoke
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

## Deployment boundary

Deployment is provider-neutral. Render and Vercel are intentionally excluded. No production deployment or live external-action activation is claimed by this repository.
