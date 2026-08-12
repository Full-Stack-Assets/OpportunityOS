# Fiverr.com → OpportunityOS Adapter Design

**Date:** 2026-08-12  
**Status:** Implemented on draft review branch; exact-head acceptance tracked in PR #7  
**Runtime:** `connectors/fiverr/fiverr_mcp_server.py`

## Objective

Add Fiverr as a read-only, lower-trust marketplace discovery adapter for OpportunityOS without misrepresenting seller service listings as buyer-posted work opportunities.

The adapter must preserve the existing `SOURCE → EVIDENCE → RANK` separation, fail closed when retrieval is blocked or unusable, and never synthesize plausible Fiverr listings after retrieval failure.

## Position in the marketplace stack

Freelancer remains the canonical buyer-demand source because its adapter retrieves buyer-posted projects through an API-backed source path.

Fiverr is classified differently. Its primary searchable records are seller service listings. Those records can be useful for market intelligence, pricing context, capability-gap discovery, and competitive analysis, but they must not be admitted or ranked as client work simply because they resemble freelance opportunities.

The Fiverr adapter therefore emits verified marketplace evidence only when a listing was actually retrieved and structurally validated, and it labels each admitted record as `service_listing`.

## Scope

In scope:

- Read-only Fiverr listing discovery.
- Structured normalization of actually retrieved listing fields.
- Explicit source classification as `service_listing`.
- Connector health/capability reporting.
- Optional affiliate-link generation kept outside ranking and source-value calculations.
- Fail-closed handling for Cloudflare, non-success responses, malformed HTML/data, and selector drift.
- Matching OpportunityOS evidence validation for the new source-kind field.
- CI verification with the current MCP Python SDK v2 runtime.

Out of scope:

- Treating seller listings as buyer-posted tasks.
- Bidding, purchasing, messaging, checkout, order creation, or account writes.
- Browser-cookie or authenticated-session automation.
- Password, MFA, payment credential, or session-cookie storage.
- Cloudflare bypass or anti-bot evasion.
- Fabricated or simulated Fiverr gigs, prices, sellers, reviews, delivery times, or URLs.
- Ranking affiliate-bearing results more highly because they can generate affiliate revenue.
- Autonomous fulfillment triggered directly from Fiverr seller listings.

## Architecture

The adapter is an isolated Python MCP server under `connectors/fiverr`. It retrieves Fiverr data, validates source facts, and emits normalized records. It does not calculate OpportunityOS fit, effort, margin, feasibility, or recommended actions.

```text
Fiverr public retrieval
        │
        ▼
Fiverr source adapter
        │
        ├── retrieval/selector validation
        ├── provenance stamping
        ├── `service_listing` classification
        └── fail-closed error semantics
        │
        ▼
Verified Marketplace Evidence boundary
        │
        ▼
OpportunityOS registry / downstream analysis
```

The existing core evidence boundary remains authoritative. The only schema extension required by this adapter is a mandatory source-kind field that distinguishes buyer-demand opportunities from seller-supply listings.

## Canonical evidence extension

`packages/core/src/source.ts` adds:

```ts
export type MarketplaceRecordKind = 'buyer_opportunity' | 'service_listing';
```

`MarketplaceOpportunityEvidence` includes:

```ts
record_kind: MarketplaceRecordKind;
```

The Freelancer adapter emits `record_kind: 'buyer_opportunity'`. The Fiverr adapter emits `record_kind: 'service_listing'`.

This is intentionally explicit rather than optional. A marketplace record without a known demand/supply classification must not cross the verified-source boundary.

## Fiverr normalized record

Where the source actually provides the values, Fiverr records normalize to the shared evidence model:

```json
{
  "platform": "fiverr",
  "platform_id": "url_sha256:2fdb62f01a61bc30f646901b9d4a0c3c98a68d510c65061cfbd552bfb7fda8c1",
  "record_kind": "service_listing",
  "title": "Example retrieved Fiverr listing title",
  "description": null,
  "budget_min": null,
  "budget_max": null,
  "currency": null,
  "bid_count": null,
  "skills": [],
  "employer_id": null,
  "deadline": null,
  "source_url": "https://www.fiverr.com/example-seller/example-listing",
  "retrieved_at": "2026-08-12T10:00:00Z",
  "retrieval_method": "fiverr_public_web",
  "verified": true,
  "raw_source": "fiverr"
}
```

Identity rules are deterministic:

1. If Fiverr exposes a stable source listing/gig identifier in the retrieved record, `platform_id` is that source identifier normalized to a non-blank string.
2. Otherwise, the adapter canonicalizes the verified Fiverr listing URL by stripping fragments and non-identity tracking parameters, then uses `platform_id = "url_sha256:" + SHA256(canonical_url)`.
3. Titles, prices, seller names, search positions, or other mutable presentation fields are never used to manufacture identity.

Source-fact rules:

1. Every populated marketplace fact must be traceable to the retrieved Fiverr response.
2. Missing data remains `null` or `[]`; it is never replaced by plausible defaults.
3. A record cannot be `verified: true` without a real retrieved listing URL, non-blank title, deterministic source identity, retrieval timestamp, and successful structural validation.
4. Price is populated only when the retrieved source explicitly exposes a parseable price for that listing.
5. Currency is populated only when the retrieved source explicitly supports the currency association; it is never silently defaulted to USD.
6. Seller listings are always `record_kind: service_listing` unless a future separately designed Fiverr buyer-demand source proves otherwise.
7. `service_listing` records may be used for market intelligence downstream but must not enter autonomous client-task execution as if they were buyer opportunities.

## Tools

### `search_fiverr_listings(query, limit=5)`

Replaces the old semantic assumption that Fiverr search returns actionable client gigs.

Behavior:

- validates a non-blank query and bounded result limit;
- performs a public Fiverr retrieval with a bounded timeout;
- parses only actually returned listing data;
- returns normalized `service_listing` records;
- returns `success`, `unavailable`, `invalid_response`, or `error`;
- never returns `simulated_results` or a synthetic fallback record.

If Fiverr blocks the request, changes markup so no trustworthy records can be parsed, returns a non-success status, or the response is malformed, the tool returns an explicit unverified failure state with `listings: []`.

### `get_fiverr_listing_details(url)`

The implementation retrieves details only from a canonical two-segment Fiverr seller/listing URL and requires both a source-backed title and a matching canonical page marker before returning `verified: true`.

If reliable detail evidence is absent, the tool returns an explicit `unavailable` or `unsupported` result. It never returns `status: success` merely because a URL can be constructed or opened manually.

### `generate_fiverr_affiliate_link(url, affiliate_id)`

Affiliate URL construction remains logically separate from marketplace evidence.

Requirements:

- strict canonical listing-URL validation;
- no effect on record verification, ranking, fit, value, or OpportunityOS execution decisions;
- no claim that an affiliate parameter format is officially valid unless that format is separately verified against current Fiverr documentation.

The current implementation marks the candidate format unverified and returns `affects_ranking: false`.

### `fiverr_connector_status()`

Returns connector version, mode, last-observed retrieval state, parser state, and explicit capabilities without secrets or an additional network request.

Capabilities include:

- `listing_search`
- `listing_details`
- `affiliate_url_generation`
- `buyer_opportunity_discovery`
- `messaging`
- `purchasing`
- `financial_actions`

`buyer_opportunity_discovery`, `messaging`, `purchasing`, and `financial_actions` are false for this tranche.

The process-local health response distinguishes:

- `healthy` — the last relevant public retrieval produced structurally verified source evidence;
- `degraded` — no retrieval has yet been verified or the last retrieved source shape could not be verified by the parser;
- `unavailable` — the last relevant public retrieval could not be completed, returned a non-success response, or was blocked by anti-bot verification.

Parser state distinguishes `ready`, `source_shape_unverified`, `unverified_until_retrieval`, and a local runtime-error state when applicable. These values describe the connector process's last observation, not global Fiverr availability.

## Error handling

The connector is fail-closed.

- Network exception → `unavailable`, zero listings.
- Cloudflare/anti-bot response → `unavailable`, zero listings.
- Non-success HTTP response → `unavailable`, zero listings.
- Malformed/non-parseable body → `invalid_response`, zero listings.
- Selector drift where candidate cards cannot be verified → `invalid_response`, zero listings.
- Deterministic local validation error → `error`, zero listings where applicable.

Error payloads do not echo secrets, cookies, raw authentication material, or arbitrary upstream error bodies.

## Data-flow guardrail

OpportunityOS must not equate all marketplace evidence with an executable opportunity.

Downstream admission for autonomous task fulfillment requires:

```text
record_kind == buyer_opportunity
```

A `service_listing` can inform competitive analysis, pricing context, market demand inference, or product/service positioning, but it cannot directly create a client WorkOrder.

This guardrail is part of the core source/evidence contract, not only the Fiverr connector, so future marketplace adapters cannot accidentally repeat the same category error.

## Testing strategy

### Connector tests

Tests cover:

- blank query rejection;
- limit validation;
- successful source-backed listing normalization;
- source-kind classification;
- deterministic source-ID derivation;
- canonical URL handling;
- missing optional values preserved as null/empty;
- symbol-only prices not inventing currency;
- non-success response failure;
- network failure;
- Cloudflare/block-page detection;
- malformed response failure;
- selector-drift/no-verifiable-listings behavior;
- no synthetic fallback path;
- no fabricated price/currency/title values;
- canonical-marker requirement for detail verification;
- dynamic capability/health/parser reporting;
- no marketplace write tools;
- no secret leakage;
- actual MCP SDK v2 tool registration.

### Core tests

Core tests verify:

- `record_kind` is required;
- only the approved enum values are accepted;
- Freelancer records use `buyer_opportunity`;
- Fiverr records use `service_listing`;
- unverified records still cannot cross the evidence boundary;
- a `service_listing` cannot satisfy buyer-opportunity execution admission.

### CI

The existing OpportunityOS CI remains authoritative and runs:

1. Node behavioral tests;
2. Freelancer connector pytest suite and Python compilation;
3. Fiverr connector pytest suite and Python compilation;
4. TypeScript/workspace typecheck;
5. smoke verification;
6. complete workspace build.

No merge or deployment is part of this tranche.

## Acceptance criteria

The Fiverr adapter is acceptable only when:

- the old simulated `$50` fallback behavior is gone;
- no fabricated Fiverr record can cross the evidence boundary;
- every Fiverr record is explicitly classified as `service_listing`;
- Freelancer is explicitly classified as `buyer_opportunity` after the shared schema extension;
- retrieval failures produce zero verified listings;
- the connector does not bypass Cloudflare or require browser-session secrets;
- seller listings cannot trigger buyer-opportunity execution;
- affiliate logic cannot influence ranking or execution;
- no marketplace write tools exist;
- tests run against MCP Python SDK v2;
- all existing OpportunityOS CI gates remain green;
- the implementation stays on `codex/fiverr-source-adapter` as a draft review branch until exact-head acceptance is complete.
