# Opportunity Aggregator Design

**Date:** 2026-08-12  
**Status:** Approved design; implementation not yet started  
**Branch:** `codex/opportunity-aggregator`  
**Stacked base:** `ce0af324b46602542d76d52d7530e522c869fab8` from `codex/fiverr-source-adapter`

## Objective

Build the first provider-neutral OpportunityOS aggregation layer that converts normalized marketplace evidence into one deterministic, explainable shortlist pipeline:

`ingest → verify → classify → dedupe → score → shortlist`

The aggregator consumes normalized marketplace evidence. It does not retrieve from Freelancer, Fiverr, Contra, Upwork, or any provider directly, and it does not perform marketplace writes, fulfillment, bidding, messaging, acceptance, purchasing, payment, or WorkOrder creation.

## Architectural position

Marketplace connectors remain responsible for provider-specific retrieval and normalization. The aggregator starts only after records are shaped into `MarketplaceOpportunityEvidence`.

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
      ├── conservative source-equivalent dedupe
      ├── scoring-input join
      ├── existing rankOpportunities() engine
      └── deterministic Top-N shortlist
      │
      ├── accepted buyer records
      ├── service-listing intelligence
      ├── rejected records
      └── duplicate receipts
```

Provider retrieval, source evidence, OpportunityOS-derived judgments, and consequential execution remain separate domains.

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

- Calling MCP connectors or provider HTTP APIs from the aggregator.
- Scheduling or polling marketplace connectors.
- PostgreSQL persistence for aggregate state in this tranche.
- Creating or mutating WorkOrders.
- Triggering BuildGraph, Trust Kernel approvals, factories, or fulfillment workers.
- Marketplace bids, messages, applications, acceptance, purchases, checkout, payments, or other writes.
- LLM-generated scoring values inside the aggregator.
- Fuzzy semantic duplicate merging using embeddings or model judgment.
- Inventing economics, deadlines, effort, urgency, capability fit, or other missing derived values.

## Core files

Implementation will be centered in:

- `packages/core/src/aggregator.ts` — provider-neutral aggregation logic.
- `packages/core/test/aggregator.test.mjs` — deterministic behavioral tests.
- `packages/core/src/index.ts` — public exports for aggregator interfaces/functions.
- `docs/architecture/overview.md` and `README.md` — pipeline and boundary documentation.

Provider connector files do not depend on aggregation internals.

## Input contracts

### Evidence input

The aggregator consumes `MarketplaceOpportunityEvidence[]`.

Every record is independently validated with `assertVerifiedMarketplaceOpportunityEvidence()` before it may enter a verified bucket. The aggregator must not mutate source evidence.

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
3. `expectedValueCents` is optional. Missing value remains unknown and is passed to the existing ranking engine as `undefined`.
4. Capability fit, evidence quality, effort points, and urgency must all be explicitly supplied for a record to be rank-eligible.
5. The aggregator never fabricates missing scoring inputs.
6. Runtime validation requires `scoringInputs` to be an array. Each entry must be a non-null object with a non-blank string `evidence_id`, finite numeric `capabilityFit`, `evidenceQuality`, `effortPoints`, and `deadlineUrgency`, and either an absent `expectedValueCents` or a non-negative integer value. Malformed individual scoring rows are recorded as invalid scoring inputs and do not abort valid neighboring rows.

## Output contract

```ts
export interface AggregateOpportunityResult {
  accepted: AcceptedBuyerRecord[];
  intelligence: IntelligenceRecord[];
  rejected: RejectedRecord[];
  duplicates: DuplicateRecord[];
  invalidScoringInputs: InvalidScoringInput[];
  shortlist: ShortlistedOpportunity[];
  stats: {
    received: number;
    verified: number;
    buyerOpportunities: number;
    serviceListings: number;
    duplicates: number;
    rejected: number;
    invalidScoringInputs: number;
    unusedScoringInputs: number;
    rankEligible: number;
    shortlisted: number;
  };
}
```

Every evidence input record has exactly one primary disposition after verification/deduplication:

- `accepted_buyer`
- `service_listing_intelligence`
- `rejected_unverified`
- `rejected_invalid`
- `duplicate`

An accepted buyer record then has one ranking disposition:

- `shortlisted`
- `ranked_not_shortlisted`
- `missing_scoring_inputs`
- `duplicate_scoring_inputs`

This two-level model prevents a valid buyer opportunity with missing or ambiguous derived scoring data from being mislabeled as invalid source evidence.

## Verification behavior

For each evidence record:

1. Attempt `assertVerifiedMarketplaceOpportunityEvidence(record)`.
2. If `verified !== true`, classify it as `rejected_unverified`.
3. If the shared source contract fails for another structural reason, classify it as `rejected_invalid`.
4. Retain original input index, safely recoverable source identity, and stable machine-readable reason code.
5. Do not expose arbitrary exception strings or upstream payloads in public aggregate results.

Malformed evidence never aborts valid neighboring records.

## Classification behavior

After verification:

- `record_kind === 'buyer_opportunity'` may proceed toward ranking.
- `record_kind === 'service_listing'` enters the `intelligence` bucket and cannot enter buyer ranking or shortlist admission.

The aggregator uses the shared `isBuyerOpportunityEvidence()` boundary. Provider-specific assumptions are not duplicated in the aggregator.

A `service_listing` cannot become a buyer opportunity merely because scoring inputs exist for its evidence ID.

## Deduplication

Deduplication is conservative and deterministic.

### Stage 1: exact evidence identity

Primary key:

```text
marketplaceEvidenceId(record) = platform + ":" + platform_id
```

If multiple verified records share the same evidence ID, retain one canonical record using:

1. newest valid `retrieved_at` timestamp;
2. if tied, lexicographically smaller `source_url`;
3. if still tied, lowest original input index.

Removed records produce duplicate receipts with reason `exact_identity` and the retained evidence ID.

### Stage 2: conservative source-equivalent detection

Cross-ID records may be collapsed only when all conditions hold:

- both are `buyer_opportunity`;
- `platform` values are equal;
- canonicalized source URLs are identical after dedupe-only normalization; and
- normalized titles are identical after Unicode normalization (`NFKC`), trim, whitespace collapse, and locale-independent lowercase conversion.

No substring matching, edit distance, embeddings, fuzzy similarity, semantic-model judgment, employer-name inference, or budget similarity is used.

Canonical selection uses the same timestamp/URL/index rule. Reason code: `source_equivalent`.

Records from different platforms are never merged in this tranche, even with identical titles or URLs that redirect to similar content.

## Dedupe URL normalization

For dedupe keys only:

1. Parse as a URL.
2. Lowercase hostname.
3. Remove query and fragment.
4. Remove a trailing slash from non-root paths.
5. Preserve scheme, host, explicit port, and path.

If parsing fails, skip Stage-2 dedupe for that record and retain it as distinct. This dedupe key never replaces `source_url` in evidence.

## Scoring join

Only canonical verified buyer opportunities participate.

Scoring rows are grouped by `evidence_id`.

Rules:

- Exactly one valid scoring row for a canonical buyer evidence ID makes that buyer rank-eligible.
- Two or more valid scoring rows for the same evidence ID make that buyer's ranking disposition `duplicate_scoring_inputs`; the buyer remains accepted but is not ranked.
- A buyer with zero valid scoring rows has ranking disposition `missing_scoring_inputs`.
- Valid scoring rows with no matching canonical buyer evidence are ignored for ranking and counted in `stats.unusedScoringInputs`.
- Invalid individual scoring rows appear in `invalidScoringInputs` and increment `stats.invalidScoringInputs`; they do not abort the batch.
- Service listings never consume scoring inputs for buyer ranking.

Duplicate or malformed scoring rows do **not** throw a batch-level error.

## Ranking

The aggregator reuses `rankOpportunities()` from `packages/core/src/opportunity.ts`.

For each rank-eligible buyer:

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

The aggregator must not introduce a second score formula. Score remains derived OpportunityOS output and is never written into underlying marketplace evidence.

## Shortlist behavior

```ts
export function aggregateOpportunities(
  evidence: MarketplaceOpportunityEvidence[],
  scoringInputs: OpportunityScoringInputs[],
  options?: { shortlistLimit?: number },
): AggregateOpportunityResult
```

`shortlistLimit` rules:

- default `10`;
- integer only;
- minimum `1`;
- maximum `100`;
- invalid values throw deterministic `TypeError` before record processing.

The top-N shortlist preserves exactly the order returned by `rankOpportunities()`: score descending, then evidence ID ordering as already defined by the existing ranker.

Only canonical verified `buyer_opportunity` records with exactly one valid scoring row can appear in `shortlist`.

## Explainability

Machine-readable reason codes include:

- `unverified_source`
- `invalid_source_contract`
- `service_listing`
- `exact_identity`
- `source_equivalent`
- `missing_scoring_inputs`
- `duplicate_scoring_inputs`
- `invalid_scoring_input`
- `unused_scoring_input`
- `ranked_not_shortlisted`
- `shortlisted`

Human-readable summaries may accompany these codes, but downstream logic relies on codes.

## Determinism

Identical evidence, scoring inputs, and options must produce deeply equal results and identical JSON serialization under the implementation's fixed property ordering.

No current time, randomness, network call, process-global mutable state, locale-sensitive collation, or nondeterministic set iteration may affect output.

The aggregator uses source-provided `retrieved_at`; it generates no aggregation timestamp inside the pure core function.

All output arrays use explicit deterministic ordering:

- `accepted`, `intelligence`, and canonical record groups: evidence ID ascending after canonical selection;
- `rejected` and `invalidScoringInputs`: original input index ascending;
- `duplicates`: retained evidence ID ascending, then duplicate original index ascending;
- `shortlist`: existing `rankOpportunities()` order.

## Error handling

Expected record-level problems become dispositions rather than batch failures.

Batch-level throws are limited to malformed top-level function arguments and invalid `shortlistLimit`. Specifically:

- `evidence` must be an array;
- `scoringInputs` must be an array;
- `options`, when provided, must be an object;
- `shortlistLimit`, when provided, must satisfy its numeric contract.

Malformed individual evidence or scoring rows never abort valid neighboring records.

No error path may create a WorkOrder or invoke external systems.

## Execution boundary

The aggregator is a pure core-domain transformation. It must not import or call:

- provider connector modules;
- MCP runtime objects;
- HTTP clients;
- PostgreSQL stores;
- WorkOrder creation/mutation functions;
- BuildGraph network clients;
- Trust Kernel authorization;
- factories;
- notification, messaging, bidding, purchasing, or payment code.

This tranche ends at shortlist production.

## Testing strategy

Minimum behavioral coverage:

1. verified buyer evidence is accepted;
2. verified service listings are isolated into intelligence;
3. unverified evidence is rejected without aborting the batch;
4. structurally invalid evidence is rejected without aborting the batch;
5. exact evidence-ID duplicates collapse deterministically;
6. newest `retrieved_at` wins exact duplicate selection;
7. same-platform identical canonical URL + normalized title collapses as `source_equivalent`;
8. cross-platform lookalikes remain distinct;
9. near-title/fuzzy lookalikes remain distinct;
10. missing scoring inputs preserve accepted evidence but exclude ranking;
11. scoring inputs cannot turn a service listing into buyer demand;
12. duplicate valid scoring rows exclude only the affected buyer from ranking;
13. malformed scoring rows do not abort valid neighbors;
14. unused scoring rows cannot create opportunities and are counted exactly;
15. existing `rankOpportunities()` determines score/order;
16. Top-N limit is deterministic;
17. invalid shortlist limits are rejected;
18. missing expected value remains unknown rather than fabricated;
19. aggregation does not mutate evidence or scoring inputs;
20. repeated identical calls produce deeply equal results;
21. every output array follows the specified deterministic ordering;
22. module has no provider/network/persistence/WorkOrder execution dependency.

Existing core, connector, typecheck, smoke, and build gates must remain green.

## Documentation

Repository docs will show:

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

The shortlist is explicitly not a bid queue, application queue, WorkOrder queue, or fulfillment trigger in this tranche.

## Stacked-branch strategy

This branch is intentionally based on Fiverr PR #7's exact accepted head because the aggregator requires `record_kind` and `isBuyerOpportunityEvidence()`.

Until PR #7 lands:

- `codex/opportunity-aggregator` remains stacked on `codex/fiverr-source-adapter`.
- Any aggregator PR targets `codex/fiverr-source-adapter`, not `main`, so only aggregator changes appear in review.

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
- source-equivalent duplicates collapse only under the specified exact conditions;
- cross-platform/fuzzy duplicates remain separate;
- source evidence is never mutated;
- missing scoring values are never invented;
- malformed/duplicate scoring rows remain record-local failures;
- existing `rankOpportunities()` remains the sole score formula;
- every accepted/excluded input is explainable with deterministic reason codes;
- only rank-eligible verified buyers can enter Top-N shortlist;
- stats use the exact fields specified in this document, including `unusedScoringInputs` and `invalidScoringInputs`;
- the core function has no external side effects;
- existing OpportunityOS tests, connector tests, typecheck, smoke verification, and build remain green;
- work stays isolated on the stacked review branch and is not merged or deployed automatically.
