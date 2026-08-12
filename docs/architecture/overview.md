# Architecture Overview

## Primary invariant

OpportunityOS follows one governed path:

`SOURCE → EVIDENCE → RANK → BUILDGRAPH PREFLIGHT → POLICY/APPROVAL → WORKORDER → FACTORY → INDEPENDENT VERIFICATION → RECEIPT → ECONOMICS/LEARNING`

No downstream component may manufacture evidence for an upstream gate.

Marketplace adapters therefore terminate at the evidence boundary. A source adapter can retrieve and normalize provider facts, but it cannot invent an opportunity when retrieval fails and it cannot create derived ranking judgments as though they were source facts.

## Source evidence boundary

`packages/core/src/source.ts` defines the canonical marketplace evidence contract. Records must carry source identity, provenance, retrieval method, source URL, retrieval timestamp, `verified: true`, and an explicit `record_kind` before they can cross the verified-source boundary.

The allowed record kinds are:

- `buyer_opportunity` — verified buyer-demand evidence that may proceed to OpportunityOS buyer-opportunity admission.
- `service_listing` — verified seller-supply evidence that may support market intelligence but cannot directly create a client WorkOrder or enter buyer-opportunity execution.

`isBuyerOpportunityEvidence()` is the shared admission helper: it returns true only for a structurally valid, verified `buyer_opportunity` record. This prevents source-specific adapters from silently treating every marketplace record as executable demand.

`connectors/freelancer` is the canonical buyer-demand adapter. It is a read-only `MCPServer` built on MCP Python SDK v2 and emits `record_kind: "buyer_opportunity"` for source-backed Freelancer projects. It fails closed on upstream errors or malformed payloads and exposes no bidding, messaging, milestone, payment, or other marketplace-write tools.

`connectors/fiverr` is a lower-trust public-web discovery adapter. It emits only `record_kind: "service_listing"` for actually retrieved and structurally validated Fiverr seller listings. Blocked public retrieval, anti-bot/Cloudflare pages, non-success responses, selector drift, or unusable markup yield zero verified listings. The adapter does not bypass anti-bot controls, use browser-session secrets, send messages, purchase gigs, or perform financial actions.

Ranking remains downstream. Capability fit, evidence quality, expected value, effort, urgency, competition, and autonomous-execution feasibility are not created by source adapters. Seller-service records may inform competitive or pricing analysis, but the buyer-opportunity execution path requires `record_kind == buyer_opportunity`.

## Security domains

1. **Source adapters / evidence boundary** — retrieve provider facts, normalize them, preserve provenance and record kind, and fail closed; they do not authorize marketplace writes or manufacture evidence.
2. **Buyer-opportunity admission** — requires verified `buyer_opportunity` evidence; `service_listing` records cannot cross this execution boundary.
3. **Control plane** — operator visibility, WorkOrder state, Needs You surface, non-secret configuration state.
4. **Trust Kernel / Action Gateway** — validates payload hash, action identity, expiry, signature verifier, and policy outcome.
5. **Execution worker** — receives an already-authorized bounded task and cannot authorize itself.
6. **Verifier** — recomputes artifact evidence independently of the factory.
7. **Persistence** — PostgreSQL stores source facts, WorkOrders, approvals, artifacts, receipts, economics, and telemetry.
8. **BuildGraph** — separate organizational memory/reuse service; OpportunityOS consumes its preflight result rather than duplicating its catalog.

## Release 0.1.0-simulation

The release proves orchestration and trust boundaries without pretending live platform actions succeeded. Factory execution emits deterministic simulation artifacts only.

The Freelancer adapter adds read-only buyer-demand discovery as an isolated source component. The Fiverr adapter adds read-only seller-service market-intelligence discovery as a separate lower-trust source component. Neither activates bidding, messaging, purchases, payment, production deployment, or other consequential marketplace actions.

Fiverr tests use mocked HTTP responses to prove parser and fail-closed behavior; they do not claim live public Fiverr retrieval is available or stable. Any later live marketplace-write adapter must sit behind the Trust Kernel and must produce provider-verifiable evidence before a WorkOrder can complete.
