# Opportunity Aggregator Design

**Date:** 2026-08-12  
**Status:** Approved design; implementation not yet started  
**Branch:** `codex/opportunity-aggregator`  
**Stacked base:** `ce0af324b46602542d76d52d7530e522c869fab8` from `codex/fiverr-source-adapter`

## Objective

Build the first provider-neutral OpportunityOS aggregation layer that converts normalized marketplace evidence into one deterministic, explainable shortlist pipeline:

`ingest → verify → classify → dedupe → score → shortlist`

The aggregator consumes normalized marketplace evidence. It does not retrieve from Freelancer, Fiverr, Contra, Upwork, or any other provider directly, and it does not perform marketplace writes, fulfillment, bidding, messaging, acceptance, purchasing, payment, or WorkOrder creation.

## Architectural position

Marketplace connectors remain responsible for provider-specific retrieval and normalization. The aggregator begins only after records have been shaped into `MarketplaceOpportunityEvidence`.

```text
Marketplace adapters
      │
      ├── Freelancer → buyer_opportunity
      ├── Fiverr     → service_listing
      └── future adapters
      │
      ▼
MarketplaceOpportunityEvidence[]
      │
      ▼
Opportunity Aggregator
      ├── structural verification
      ├── record-kind classification
      ├── deterministic exact dedupe
      ├── conservative cross-record dedupe
      ├── scoring-input join
      ├── existing rankOpportunities() engine
      └── deterministic Top-N shortlist
      │
      ├── buyer shortlist
      ├── service-listing intelligence
      ├── rejected records
      └── duplicate receipts
```

This keeps provider retrieval, source evidence, derived judgments, and consequential execution in separate domains.

## Scope

In scope:

- Accept normalized marketplace evidence batches from any source adapter.
- Validate every record through the existing shared evidence contract.
- Separate verified `buyer_opportunity` evidence from verified `service_listing` intelligence.
- Deduplicate verified records deterministically.
- Join source evidence to explicitly supplied OpportunityOS scoring inputs.
- Reuse the existing deterministic `rankOpportunities()` function.
- Produce a deterministic Top-N buyer-opportunity shortlist.
- Preserve explainable disposition reasons for every input record.
- Return aggregate counts useful for reporting and telemetry.
- Add focused unit tests and documentation.

Out of scope:

- Calling MCP connectors or HTTP provider APIs from the aggregator.
- Scheduling or polling marketplace connectors.
- Persisting aggregate state to PostgreSQL in this tranche.
- Creating or mutating WorkOrders.
- Triggering BuildGraph, Trust Kernel approvals, factories, or fulfillment workers.
- Marketplace bids, messages, applications, acceptance, purchases, checkout, payments, or other external writes.
- LLM-generated scoring values inside the aggregator.
- Fuzzy semantic duplicate merging based on embeddings or model judgment.
- Inventing economics, deadlines, effort, urgency, capability fit, or other missing derived values.

## Core files

Implementation will be centered in:

- `packages/core/src/aggregator.ts` — provider-neutral aggregation logic.
- `packages/core/test/aggregator.test.mjs` — deterministic behavioral tests.
- `packages/core/src/index.ts` — exports for aggregator interfaces/functions.
- `docs/architecture/overview.md` and `README.md` — pipeline and boundary documentation.

No provider connector file needs to know about aggregation internals.

## Input contracts

### Evidence input

The aggregator consumes:

```ts
MarketplaceOpportunityEvidence[]
```

Every record is independently validated with `assertVerifiedMarketplaceOpportunityEvidence()` before it may enter a verified bucket.

The aggregator must not mutate source evidence.

### Scoring input

Derived scoring information is supplied separately:

```ts
export interface OpportunityScoringInputs {
  evidence_id: string;
  capabilityFit: number;
  evidenceQuality: number;
  expectedValueCents?: number;
  effortPoints: number;
  deadlineUrgency: number;
}
```

`evidence_id` is the canonical value returned by `marketplaceEvidenceId(evidence)`, currently `${platform}:${platform_id}`.

Rules:

1. Scoring inputs are OpportunityOS-derived judgments, not marketplace facts.
2. Scoring inputs never overwrite or mutate source evidence.
3. `expectedValueCents` is optional. Missing value stays unknown and is passed to the existing ranking engine as `undefined`.
4. Capability fit, evidence quality, effort points, and urgency must be explicitly supplied for a record to be ranked.
5. The aggregator never fabricates missing scoring inputs.

## Output contract

The main aggregation function will return a deterministic result shaped as:

```ts
export interface AggregateOpportunityResult {
  accepted: AcceptedBuyerRecord[];
  intelligence: IntelligenceRecord[];
  rejected: RejectedRecord[];
  duplicates: DuplicateRecord[];
  shortlist: ShortlistedOpportunity[];
  stats: {
    received: number;
    verified: number;
    buyerOpportunities: number;
    serviceListings: number;
    duplicates: number;
    rejected: number;
    rankEligible: number;
    shortlisted: number;
  };
}
```

Every input record must have exactly one primary disposition after verification/deduplication:

- `accepted_buyer`
- `service_listing_intelligence`
- `rejected_unverified`
- `rejected_invalid`
- `duplicate`

An accepted buyer record then has a ranking disposition:

- `shortlisted`
- `ranked_not_shortlisted`
- `missing_scoring_inputs`

This two-level disposition model prevents a valid buyer opportunity with missing derived scoring data from being mislabeled as invalid source evidence.

## Verification behavior

For each input record:

1. Attempt `assertVerifiedMarketplaceOpportunityEvidence(record)`.
2. If verification fails because `verified !== true`, classify it as `rejected_unverified`.
3. If verification fails for structural/source-contract reasons, classify it as `rejected_invalid`.
4. Never throw away the failure silently; retain an index, source identity if safely available, and a stable machine-readable reason code.
5. Do not include arbitrary exception strings or secret-bearing upstream payloads in public result objects.

Verified records proceed to deduplication.

## Classification behavior

After verification:

- `record_kind === 'buyer_opportunity'` may proceed toward ranking.
- `record_kind === 'service_listing'` goes to the `intelligence` bucket and cannot enter buyer ranking or shortlist admission.

The aggregator must use the shared `isBuyerOpportunityEvidence()` boundary rather than duplicating provider-specific assumptions.

A `service_listing` cannot become a buyer opportunity because it has scoring inputs.

## Deduplication

Deduplication is intentionally conservative and deterministic.

### Stage 1: exact evidence identity

Primary key:

```text
marketplaceEvidenceId(record) = platform + ":" + platform_id
```

If multiple verified records have the same evidence ID, retain exactly one canonical record.

Canonical selection rule:

1. Prefer the record with the newest valid `retrieved_at` timestamp.
2. If timestamps are equal, prefer the lexicographically smaller `source_url`.
3. Remaining ties are resolved by original input index.

All removed records produce duplicate receipts referencing the retained evidence ID and reason `exact_identity`.

### Stage 2: conservative source-equivalent duplicate detection

Cross-ID duplicates may be collapsed only when all of these are true:

- both records are `buyer_opportunity`;
- `platform` values are equal;
- canonicalized source URLs are identical after stripping fragment and query components; and
- normalized titles are identical after Unicode-aware trim, whitespace collapse, and lowercase conversion.

No substring matching, edit distance, embeddings, fuzzy similarity, semantic-model judgment, employer-name inference, or budget similarity is used.

Canonical selection uses the same timestamp/URL/index rule as Stage 1.

Reason code: `source_equivalent`.

Records from different platforms are **not** merged in this tranche even when titles look identical.

## Canonical source URL normalization for dedupe

For dedupe only, normalize a verified source URL by:

1. Parsing it as a URL.
2. Lowercasing the hostname.
3. Removing fragment and query.
4. Removing a trailing slash from non-root paths.
5. Preserving scheme, host, port if explicitly present, and path.

If URL parsing fails despite the record already passing the shared evidence contract, do not perform Stage-2 dedupe for that record; retain it as distinct rather than guessing equivalence.

This normalization is a dedupe key only. It never replaces `source_url` in source evidence.

## Scoring join

Only canonical verified buyer opportunities participate.

Scoring inputs are indexed by `evidence_id`.

Rules:

- Duplicate scoring rows for the same `evidence_id` are rejected as ambiguous configuration for that record.
- Scoring rows with no matching canonical buyer evidence are ignored by aggregation and reported in `unusedScoringInputCount` or an equivalent stats field; they do not manufacture opportunities.
- A buyer opportunity without a complete scoring input row remains accepted with ranking disposition `missing_scoring_inputs`.
- Service listings never consume scoring inputs for buyer ranking.

## Ranking

The aggregator reuses `rankOpportunities()` from `packages/core/src/opportunity.ts`.

For each rank-eligible buyer record, construct:

```ts
{
  id: evidence_id,
  capabilityFit,
  evidenceQuality,
  expectedValueCents,
  effortPoints,
  deadlineUrgency
}
```

The aggregator must not introduce a second score formula.

The resulting score is a derived OpportunityOS value and must be stored only in aggregate/ranking output, never written into the underlying marketplace evidence object.

## Shortlist behavior

Main function signature:

```ts
export function aggregateOpportunities(
  evidence: MarketplaceOpportunityEvidence[],
  scoringInputs: OpportunityScoringInputs[],
  options?: { shortlistLimit?: number },
): AggregateOpportunityResult
```

`shortlistLimit` rules:

- default: `10`;
- integer only;
- minimum `1`;
- maximum `100`;
- invalid values throw a deterministic `TypeError` before aggregation begins.

Shortlist order is exactly the order returned by `rankOpportunities()` and is therefore deterministic by score and then evidence ID.

Only verified canonical `buyer_opportunity` records with complete scoring inputs can appear in `shortlist`.

## Explainability

The aggregator must make exclusions auditable without exposing secrets.

Machine-readable reason codes include at least:

- `unverified_source`
- `invalid_source_contract`
- `service_listing`
- `exact_identity`
- `source_equivalent`
- `missing_scoring_inputs`
- `duplicate_scoring_inputs`
- `ranked_not_shortlisted`
- `shortlisted`

Result objects may include human-readable summaries, but downstream logic must rely on reason codes.

## Determinism

Given identical evidence records, scoring inputs, and options, the result must be byte-for-byte equivalent after JSON serialization with the same property ordering produced by the implementation.

No current time, randomness, network call, process-global mutable state, locale-sensitive ordering, or nondeterministic set iteration may affect the aggregate result.

The aggregator uses source-provided `retrieved_at`; it does not generate a new aggregation timestamp in the deterministic core function.

## Error handling

Expected per-record source problems become dispositions rather than aborting the whole batch.

Batch-level errors are limited to invalid aggregator configuration, including:

- invalid `shortlistLimit`;
- malformed `scoringInputs` container shape if runtime validation is required;
- duplicate scoring entries for the same evidence ID only insofar as that record cannot be ranked unambiguously.

A malformed individual evidence record must not cause valid neighboring records to be lost.

No error path may create a WorkOrder or invoke external systems.

## Execution boundary

The aggregator is a pure core-domain transformation.

It must not import or call:

- provider connector modules;
- MCP runtime objects;
- HTTP clients;
- PostgreSQL stores;
- `createWorkOrder` or WorkOrder mutation functions;
- BuildGraph network clients;
- Trust Kernel authorization;
- factories;
- external notification, messaging, bidding, purchasing, or payment code.

Its output can be consumed by later orchestration designs, but this tranche ends at shortlist production.

## Testing strategy

Minimum behavioral coverage:

1. verified buyer evidence is accepted;
2. verified service listings are isolated into intelligence;
3. unverified records are rejected without aborting the batch;
4. structurally invalid records are rejected without aborting the batch;
5. exact evidence-ID duplicates collapse deterministically;
6. newest `retrieved_at` wins exact duplicate selection;
7. same-platform identical canonical URL + normalized title collapses as `source_equivalent`;
8. cross-platform lookalikes remain distinct;
9. near-title/fuzzy lookalikes remain distinct;
10. missing scoring inputs preserve accepted evidence but exclude ranking;
11. scoring inputs cannot turn a service listing into a buyer opportunity;
12. duplicate scoring input rows are surfaced deterministically;
13. unused scoring inputs cannot create records;
14. existing `rankOpportunities()` determines final score/order;
15. Top-N limit is deterministic;
16. invalid shortlist limits are rejected;
17. missing expected value remains unknown rather than fabricated;
18. aggregation does not mutate input evidence or scoring objects;
19. repeated identical calls produce deeply equal results;
20. module has no provider/network/persistence/WorkOrder execution dependency.

Existing core, connector, typecheck, smoke, and build gates must remain green.

## Documentation

Repository docs will describe the resulting flow as:

```text
SOURCE ADAPTERS
      ↓
VERIFIED MARKETPLACE EVIDENCE
      ↓
AGGREGATE / CLASSIFY / DEDUPE
      ↓
JOIN DERIVED SCORING INPUTS
      ↓
DETERMINISTIC RANKING
      ↓
TOP-N SHORTLIST
      ↓
[future orchestration boundary]
```

Documentation must explicitly state that the shortlist is not a bid queue, application queue, WorkOrder queue, or fulfillment trigger in this tranche.

## Stacked-branch strategy

This branch is intentionally based on Fiverr PR #7's exact accepted head because the aggregator requires `record_kind` and `isBuyerOpportunityEvidence()`.

Until PR #7 lands:

- `codex/opportunity-aggregator` remains stacked on `codex/fiverr-source-adapter`.
- Any aggregator PR should target `codex/fiverr-source-adapter`, not `main`, to keep the diff reviewable.

After PR #7 lands unchanged or equivalently:

- rebase or retarget the aggregator PR to `main` without widening scope;
- rerun exact-head CI;
- do not merge automatically.

## Acceptance criteria

The aggregator tranche is acceptable only when:

- it consumes normalized evidence rather than provider APIs;
- every verified record is classified using the shared evidence boundary;
- `service_listing` never enters buyer-opportunity ranking;
- exact duplicates collapse deterministically;
- conservative source-equivalent duplicates collapse only under the specified exact conditions;
- cross-platform/fuzzy duplicates remain separate;
- source evidence is never mutated;
- missing scoring values are never invented;
- existing `rankOpportunities()` remains the sole score formula;
- every accepted/excluded input is explainable with deterministic reason codes;
- only rank-eligible verified buyers can enter Top-N shortlist;
- the core function has no external side effects;
- existing OpportunityOS tests, typecheck, smoke verification, connector tests, and build remain green;
- work stays isolated on the stacked review branch and is not merged or deployed automatically.
