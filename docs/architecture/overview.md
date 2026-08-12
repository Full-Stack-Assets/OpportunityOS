# Architecture Overview

## Primary invariant

OpportunityOS follows one governed path:

`SOURCE → EVIDENCE → AGGREGATE/CLASSIFY/DEDUPE → DERIVED SCORING → RANK/SHORTLIST → BUILDGRAPH PREFLIGHT → POLICY/APPROVAL → WORKORDER → FACTORY → INDEPENDENT VERIFICATION → RECEIPT → ECONOMICS/LEARNING`

No downstream component may manufacture evidence for an upstream gate.

Marketplace adapters terminate at the evidence boundary. They can retrieve and normalize provider facts, but they cannot invent an opportunity when retrieval fails and they cannot create derived ranking judgments as though they were source facts.

## Source evidence boundary

`packages/core/src/source.ts` defines the canonical marketplace evidence contract. Records must carry source identity, provenance, retrieval method, source URL, retrieval timestamp, `verified: true`, and an explicit `record_kind` before they can cross the verified-source boundary.

The allowed record kinds are:

- `buyer_opportunity` — verified buyer-demand evidence that may proceed toward OpportunityOS ranking.
- `service_listing` — verified seller-supply evidence that may support market intelligence but cannot enter buyer-opportunity ranking or directly create a client WorkOrder.

`isBuyerOpportunityEvidence()` is the shared admission helper: it returns true only for a structurally valid, verified `buyer_opportunity` record. This prevents source-specific adapters from silently treating every marketplace record as executable demand.

`connectors/freelancer` is the canonical buyer-demand adapter. It is a read-only `MCPServer` built on MCP Python SDK v2 and emits `record_kind: "buyer_opportunity"` for source-backed Freelancer projects. It fails closed on upstream errors or malformed payloads and exposes no bidding, messaging, milestone, payment, or other marketplace-write tools.

`connectors/fiverr` is a lower-trust public-web discovery adapter. It emits only `record_kind: "service_listing"` for actually retrieved and structurally validated Fiverr seller listings. Blocked public retrieval, anti-bot/Cloudflare pages, non-success responses, selector drift, or unusable markup yield zero verified listings. The adapter does not bypass anti-bot controls, use browser-session secrets, send messages, purchase gigs, or perform financial actions.

## Opportunity Aggregator boundary

`packages/core/src/aggregator.ts` consumes normalized marketplace evidence and separately supplied OpportunityOS scoring inputs. It is a pure core-domain transformation with no provider, network, persistence, WorkOrder, BuildGraph, Trust Kernel, factory, messaging, bidding, purchasing, or payment dependency.

The pipeline is:

```text
VERIFIED MARKETPLACE EVIDENCE
      ↓
CLASSIFY BY record_kind
      ↓
CONSERVATIVE DETERMINISTIC DEDUPE
      ↓
JOIN EXPLICIT DERIVED SCORING INPUTS
      ↓
EXISTING rankOpportunities() FORMULA
      ↓
TOP-N BUYER-OPPORTUNITY SHORTLIST
      ↓
[FUTURE ORCHESTRATION BOUNDARY]
```

`service_listing` records terminate in an intelligence bucket. They cannot become buyer opportunities merely because scoring inputs exist for them.

Buyer deduplication is deliberately conservative. Exact evidence identity is collapsed first. Source-equivalent cross-ID records are collapsed only for the same platform when the dedupe-normalized source URL and normalized title are exactly equal. Cross-platform lookalikes and fuzzy/semantic similarities remain separate.

Canonical selection is deterministic: newest `retrieved_at`, then lexicographically smaller `source_url`, then lower original input index.

Derived scoring is separate from source facts. Malformed scoring rows, duplicate scoring rows, or missing scoring inputs do not corrupt neighboring evidence. A buyer with no unambiguous complete scoring row remains verified and accepted but cannot enter the ranking set. Missing expected value remains unknown rather than being fabricated.

The existing `rankOpportunities()` function remains the sole score formula. The aggregator adds no competing ranking algorithm.

The Top-N shortlist is analysis output only. It is not a bid queue, application queue, WorkOrder queue, fulfillment trigger, marketplace authorization, or approval to perform external side effects.

## Security domains

1. **Source adapters / evidence boundary** — retrieve provider facts, normalize them, preserve provenance and record kind, and fail closed; they do not authorize marketplace writes or manufacture evidence.
2. **Aggregator / buyer-ranking admission** — validates, classifies, conservatively deduplicates, joins explicit derived scoring, and produces an explainable shortlist; it has no external side effects.
3. **Control plane** — operator visibility, WorkOrder state, Needs You surface, non-secret configuration state.
4. **BuildGraph preflight** — organizational memory/reuse service consumed only after shortlist/orchestration selects a candidate for further processing.
5. **Trust Kernel / Action Gateway** — validates payload hash, action identity, expiry, signature verifier, and policy outcome.
6. **Execution worker** — receives an already-authorized bounded task and cannot authorize itself.
7. **Verifier** — recomputes artifact evidence independently of the factory.
8. **Persistence** — PostgreSQL stores source facts, WorkOrders, approvals, artifacts, receipts, economics, and telemetry where applicable; the current aggregator does not persist its own state.

## Release 0.1.0-simulation

The release proves orchestration and trust boundaries without pretending live platform actions succeeded. Factory execution emits deterministic simulation artifacts only.

The Freelancer adapter adds read-only buyer-demand discovery as an isolated source component. The Fiverr adapter adds read-only seller-service market-intelligence discovery as a separate lower-trust source component. The Opportunity Aggregator adds deterministic evidence aggregation and shortlist production without activating bidding, messaging, purchases, payment, production deployment, WorkOrder creation, or other consequential marketplace actions.

Connector tests use controlled HTTP responses to prove parser and fail-closed behavior; aggregator tests prove deterministic classification, dedupe, scoring joins, ranking reuse, non-mutation, and pure-core boundaries. These tests do not claim that live public marketplace retrieval or fulfillment is available or successful.

Any later live marketplace-write adapter must sit behind the Trust Kernel and must produce provider-verifiable evidence before a WorkOrder can complete.
