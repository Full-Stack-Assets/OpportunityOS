# Data-room index

Map buyer diligence questions to files in this repository. Paths are relative to repo root unless noted.

**Head described:** `main` @ `6903279`  
**Honesty rule:** if a file says simulation, fail-closed, or pending, quote it. Do not upgrade it in a slide.

## M&A package (this folder)

| Document | Path |
|---|---|
| Asset perimeter | [docs/ma/asset-perimeter.md](asset-perimeter.md) |
| One-pager | [docs/ma/one-pager.md](one-pager.md) |
| CIM-lite | [docs/ma/cim-lite.md](cim-lite.md) |
| Buyer map | [docs/ma/buyer-map.md](buyer-map.md) |
| IP and name | [docs/ma/ip-and-name.md](ip-and-name.md) |
| Demo script | [docs/ma/demo-script.md](demo-script.md) |
| Unsent outreach drafts | [docs/ma/outreach-emails.md](outreach-emails.md) |

## Product and architecture

| Topic | Path |
|---|---|
| README / release boundary | [README.md](../../README.md) |
| Architecture overview | [docs/architecture/overview.md](../architecture/overview.md) |
| Threat model | [docs/architecture/threat-model.md](../architecture/threat-model.md) |
| Operations gates | [docs/architecture/operations.md](../architecture/operations.md) |
| BuildGraph integration | [docs/architecture/buildgraph-integration.md](../architecture/buildgraph-integration.md) |
| Release evidence matrix | [docs/architecture/release-evidence.md](../architecture/release-evidence.md) |
| Commercial Intelligence Engine | [docs/commercial-intelligence-engine.md](../commercial-intelligence-engine.md) |
| Public-demand collectors | [docs/public-demand-collectors.md](../public-demand-collectors.md) |

## Source adapters

| Topic | Path |
|---|---|
| Freelancer (read-only) | [connectors/freelancer/README.md](../../connectors/freelancer/README.md) |
| Fiverr (listings only) | [connectors/fiverr/README.md](../../connectors/fiverr/README.md) |
| Evidence / `record_kind` | [packages/core/src/source.ts](../../packages/core/src/source.ts) |

## Code kernels (highest-signal)

| Topic | Path |
|---|---|
| Trust Kernel | [packages/core/src/trust-kernel.ts](../../packages/core/src/trust-kernel.ts) |
| WorkOrder FSM | [packages/core/src/work-order.ts](../../packages/core/src/work-order.ts) |
| Simulation orchestrator | [packages/core/src/orchestrator.ts](../../packages/core/src/orchestrator.ts) |
| Investigation packets | [packages/core/src/critical-investigation.ts](../../packages/core/src/critical-investigation.ts) |
| Postgres store (minimal) | [packages/postgres/src/store.ts](../../packages/postgres/src/store.ts) |
| Schema | [database/migrations/001_initial.sql](../../database/migrations/001_initial.sql) |

## Verification

| Topic | Path |
|---|---|
| Current verification report | [verification-report.md](../../verification-report.md) |
| CI | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |
| Smoke | [scripts/smoke.ts](../../scripts/smoke.ts) |
| Buyer demo (script) | [scripts/buyer-demo.ts](../../scripts/buyer-demo.ts) |
| Plugin/tool guard | [scripts/verify-buildgraph-plugins.mjs](../../scripts/verify-buildgraph-plugins.mjs) |

## Unmerged PRs (not shipped)

| PR | Notes |
|---|---|
| [#10](https://github.com/Full-Stack-Assets/OpportunityOS/pull/10) | Draft leftover aggregator verification |
| [#16](https://github.com/Full-Stack-Assets/OpportunityOS/pull/16) | Knowledge v0.1; dirty vs `main` |
| [#22](https://github.com/Full-Stack-Assets/OpportunityOS/pull/22) | Draft Agentic Fabric Unit 1 |
| [#11](https://github.com/Full-Stack-Assets/OpportunityOS/issues/11) | Knowledge/BuildGraph execution issue; not a deliverable |

## Design history (specs, not product claims)

`docs/superpowers/specs/` and `docs/superpowers/plans/` record how `main` was built. Treat completed plans as history; unmerged PRs remain unmerged.

## Empty / pending items (do not invent)

- Customer contracts, ARR, pipeline CRM
- Production identity provider
- Live authenticated BuildGraph evidence pack
- Live PostgreSQL production binding
- Trademark registrations
- LICENSE file (see IP note)
