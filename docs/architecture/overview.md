# Architecture Overview

## Primary invariant

OpportunityOS follows one governed path:

`SOURCE → EVIDENCE → RANK → BUILDGRAPH PREFLIGHT → POLICY/APPROVAL → WORKORDER → FACTORY → INDEPENDENT VERIFICATION → RECEIPT → ECONOMICS/LEARNING`

No downstream component may manufacture evidence for an upstream gate.

## Security domains

1. **Control plane** — operator visibility, WorkOrder state, Needs You surface, non-secret configuration state.
2. **Trust Kernel / Action Gateway** — validates payload hash, action identity, expiry, signature verifier, and policy outcome.
3. **Execution worker** — receives an already-authorized bounded task and cannot authorize itself.
4. **Verifier** — recomputes artifact evidence independently of the factory.
5. **Persistence** — PostgreSQL stores source facts, WorkOrders, approvals, artifacts, receipts, economics, and telemetry.
6. **BuildGraph** — separate organizational memory/reuse service; OpportunityOS consumes its preflight result rather than duplicating its catalog.

## Release 0.1.0-simulation

The release proves orchestration and trust boundaries without pretending live platform actions succeeded. Factory execution emits deterministic simulation artifacts only. Any later live adapter must sit behind the Trust Kernel and must produce provider-verifiable evidence before a WorkOrder can complete.
