# Architecture Overview

## Primary invariant

OpportunityOS follows one governed path:

`SOURCE → EVIDENCE → RANK → BUILDGRAPH PREFLIGHT → POLICY/APPROVAL → WORKORDER → FACTORY → INDEPENDENT VERIFICATION → RECEIPT → ECONOMICS/LEARNING`

No downstream component may manufacture evidence for an upstream gate.

Marketplace adapters therefore terminate at the evidence boundary. A source adapter can retrieve and normalize provider facts, but it cannot invent an opportunity when retrieval fails and it cannot create derived ranking judgments as though they were source facts.

## Source evidence boundary

`packages/core/src/source.ts` defines the canonical marketplace opportunity evidence contract. Records must carry source identity, provenance, retrieval method, source URL, retrieval timestamp, and `verified: true` before they can cross the verified-source boundary.

The first concrete adapter is `connectors/freelancer`, a read-only `MCPServer` built on MCP Python SDK v2 for Freelancer.com. It fails closed on upstream errors or malformed payloads, emits zero opportunities on retrieval failure, and exposes no bidding, messaging, milestone, payment, or other marketplace-write tools.

Ranking remains downstream. Capability fit, evidence quality, expected value, effort, urgency, competition, and autonomous-execution feasibility are not created by the source adapter.

## Security domains

1. **Source adapters / evidence boundary** — retrieve provider facts, normalize them, preserve provenance, and fail closed; they do not authorize marketplace writes or manufacture evidence.
2. **Control plane** — operator visibility, WorkOrder state, Needs You surface, non-secret configuration state.
3. **Trust Kernel / Action Gateway** — validates payload hash, action identity, expiry, signature verifier, and policy outcome.
4. **Execution worker** — receives an already-authorized bounded task and cannot authorize itself.
5. **Verifier** — recomputes artifact evidence independently of the factory.
6. **Persistence** — PostgreSQL stores source facts, WorkOrders, approvals, artifacts, receipts, economics, and telemetry.
7. **BuildGraph** — separate organizational memory/reuse service; OpportunityOS consumes its preflight result rather than duplicating its catalog.

## Release 0.1.0-simulation

The release proves orchestration and trust boundaries without pretending live platform actions succeeded. Factory execution emits deterministic simulation artifacts only. The Freelancer source adapter adds read-only discovery capability as an isolated source component; it does not activate bidding, messaging, payment, production deployment, or other consequential marketplace actions. Any later live write adapter must sit behind the Trust Kernel and must produce provider-verifiable evidence before a WorkOrder can complete.
