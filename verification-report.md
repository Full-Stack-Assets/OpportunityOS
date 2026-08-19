# OpportunityOS Verification Report

**Release:** `0.1.0-simulation`  
**Date:** 2026-08-19  
**Target repository:** `Full-Stack-Assets/OpportunityOS`  
**Described head:** `main` @ `6903279` (merge of public-demand collectors PR #19; commercial intelligence already on `main` via PR #20)

This report replaces the 2026-08-11 snapshot that claimed **13/13** tests. That figure is stale. Do not use it in diligence.

## Verified locally (2026-08-19)

- Node behavioral suite (`packages/core`, `packages/postgres`, `packages/public-demand-collectors`): **133/133 passed, 0 failed**.
- BuildGraph plugin/tool guard: **5 plugin profiles, 5 read-only MCP tools**.
- Freelancer + Fiverr pytest: **57 passed, 0 failed**.
- Smoke (`npm run smoke`): `COMPLETED`, independent verification `true`, execution mode `SIMULATION`, `externalSideEffects = 0`, three chained receipts.
- Buyer demo (`npm run demo`): simulation WorkOrder plus P0-Critical investigation packet with `externalActionAllowed = false`.

Re-run:

```bash
npm test
npm run smoke
npm run demo
pytest -q connectors/freelancer/tests connectors/fiverr/tests
```

CI (`.github/workflows/ci.yml`) now runs `npm ci`, the same tests, smoke, **and** `npm run demo` against the committed lockfile.

## Intentionally not claimed

- PostgreSQL **live** migration against a running server is an operations gate ([docs/architecture/operations.md](docs/architecture/operations.md) item 6; [docs/architecture/release-evidence.md](docs/architecture/release-evidence.md)).
- Authenticated **live** BuildGraph `/v1/preflight` round-trip is environment-dependent and not claimed here.
- No consequential external provider action is enabled. `OPPORTUNITYOS_EXECUTION_MODE` remains `simulation`.
- Control-plane pipeline counts in the UI are **synthetic preview data**, labeled as such.
- Win probability remains `UNCALIBRATED_V1`.

## Unmerged pull requests (not shipped)

Inventory as of 2026-08-19. **Do not describe these as current product on `main`.**

| PR | State | Title | Diligence note |
|---|---|---|---|
| [#10](https://github.com/Full-Stack-Assets/OpportunityOS/pull/10) | open, draft | Complete opportunity aggregator post-merge verification | Leftover verification on a stacked branch; aggregator logic already landed via earlier merge |
| [#16](https://github.com/Full-Stack-Assets/OpportunityOS/pull/16) | open | BuildGraph unified knowledge v0.1 | Optional knowledge-inbox upside; reported dirty vs `main` |
| [#22](https://github.com/Full-Stack-Assets/OpportunityOS/pull/22) | open, draft | Agentic Fabric Unit 1: canonical architecture registry | Serial fabric unit; authors asked not to merge until later units complete |

Related issue: [#11](https://github.com/Full-Stack-Assets/OpportunityOS/issues/11) Unified Knowledge Base / BuildGraph v0.1 — roadmap anchor, not a completed deliverable.

## Release interpretation

The deterministic trust, collector, and commercial-intelligence contracts are locally verified. External infrastructure and live provider writes remain explicit, fail closed, and outside this release. That honesty is part of the M&A story; it is not a defect to paper over.
