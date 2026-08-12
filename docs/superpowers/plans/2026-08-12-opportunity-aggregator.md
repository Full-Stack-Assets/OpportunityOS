# Opportunity Aggregator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, provider-neutral OpportunityOS aggregation pipeline that verifies, classifies, deduplicates, joins explicit scoring inputs, reuses the existing ranker, and emits an explainable deterministic Top-N buyer-opportunity shortlist.

**Architecture:** Implement one new pure core module, `packages/core/src/aggregator.ts`, consuming only normalized `MarketplaceOpportunityEvidence[]` plus separate `OpportunityScoringInputs[]`. The module must preserve source/derived/execution boundaries, use the shared source validator and buyer-admission helper, perform conservative deterministic dedupe, and call the existing `rankOpportunities()` function rather than defining a second score formula.

**Tech Stack:** Node 22+, TypeScript 6, Node built-in test runner, existing OpportunityOS core modules, GitHub Actions.

## Global Constraints

- Branch: `codex/opportunity-aggregator`.
- Stacked base: `ce0af324b46602542d76d52d7530e522c869fab8` from `codex/fiverr-source-adapter`.
- Aggregator input is normalized marketplace evidence; it must not call provider APIs, MCP connectors, HTTP clients, or persistence.
- `service_listing` records never enter buyer ranking or shortlist admission.
- Existing `rankOpportunities()` remains the sole score formula.
- Source evidence and scoring input objects must not be mutated.
- Missing source or derived values must not be fabricated.
- Cross-platform or fuzzy-semantic duplicates are not merged.
- Malformed individual evidence/scoring rows are record-local failures and do not abort valid neighbors.
- No WorkOrder creation, BuildGraph call, Trust Kernel action, factory invocation, bid, message, application, purchase, payment, or other external side effect.
- `shortlistLimit` defaults to `10`, must be an integer in `1..100`, and invalid values throw `TypeError` before record processing.
- Until Fiverr PR #7 lands, any aggregator PR targets `codex/fiverr-source-adapter`, not `main`.
- No automatic merge or deployment in this tranche.

---

### Task 1: Establish aggregation contracts and source classification

**Files:**
- Create: `packages/core/src/aggregator.ts`
- Create: `packages/core/test/aggregator.test.mjs`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `MarketplaceOpportunityEvidence`, `assertVerifiedMarketplaceOpportunityEvidence`, `isBuyerOpportunityEvidence`, `marketplaceEvidenceId` from `./source.ts`.
- Produces: `OpportunityScoringInputs`, `AcceptedBuyerRecord`, `IntelligenceRecord`, `RejectedRecord`, `DuplicateRecord`, `InvalidScoringInput`, `ShortlistedOpportunity`, `AggregateOpportunityResult`, and `aggregateOpportunities()`.

- [ ] **Step 1: Write failing tests for top-level validation and source classification**

Add tests demonstrating:

```js
assert.throws(() => aggregateOpportunities(null, []), /evidence must be an array/);
assert.throws(() => aggregateOpportunities([], null), /scoringInputs must be an array/);
assert.throws(() => aggregateOpportunities([], [], {shortlistLimit: 0}), /shortlistLimit/);
```

Also add one verified `buyer_opportunity`, one verified `service_listing`, one `verified: false` record, and one structurally invalid verified record. Assert that the buyer lands in `accepted`, the service listing in `intelligence`, and the other two in `rejected` with `unverified_source` and `invalid_source_contract` respectively.

- [ ] **Step 2: Run focused test to verify RED**

Run:

```bash
node --experimental-strip-types --test packages/core/test/aggregator.test.mjs
```

Expected: FAIL because `aggregator.ts` / `aggregateOpportunities()` do not exist.

- [ ] **Step 3: Implement minimal public contracts and classification**

Implement the interfaces and a first `aggregateOpportunities()` that:

```ts
export function aggregateOpportunities(
  evidence: MarketplaceOpportunityEvidence[],
  scoringInputs: OpportunityScoringInputs[],
  options?: { shortlistLimit?: number },
): AggregateOpportunityResult
```

Validation rules:

```ts
if (!Array.isArray(evidence)) throw new TypeError('evidence must be an array');
if (!Array.isArray(scoringInputs)) throw new TypeError('scoringInputs must be an array');
if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
  throw new TypeError('options must be an object');
}
```

Validate `shortlistLimit` before looping records. Catch shared evidence validation failures per record, distinguishing `verified !== true` from other contract failures. Use `isBuyerOpportunityEvidence()` for buyer admission; verified service listings go to `intelligence`.

Return deterministic empty `duplicates`, `invalidScoringInputs`, and `shortlist` arrays for now plus exact stats fields from the spec.

- [ ] **Step 4: Export aggregator module**

Append to `packages/core/src/index.ts`:

```ts
export * from './aggregator.ts';
```

- [ ] **Step 5: Run focused tests to GREEN**

Run the focused aggregator test and then:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

Commit message:

```text
feat: add opportunity aggregation boundary
```

### Task 2: Add deterministic evidence deduplication

**Files:**
- Modify: `packages/core/src/aggregator.ts`
- Modify: `packages/core/test/aggregator.test.mjs`

**Interfaces:**
- Produces internal deterministic helpers for normalized title, dedupe-only URL key, and canonical-record selection.
- Produces duplicate receipts with reasons `exact_identity` or `source_equivalent`.

- [ ] **Step 1: Write failing exact-dedupe tests**

Create two verified records with the same `platform:platform_id`, different `retrieved_at`, and assert that the newer record is retained and the older one becomes a duplicate receipt with `reason: 'exact_identity'`.

Add ties proving lexicographically smaller `source_url` wins, then lowest original input index wins.

- [ ] **Step 2: Run focused tests to verify RED**

Run only the exact-dedupe test names. Expected: FAIL because duplicates are not collapsed yet.

- [ ] **Step 3: Implement exact identity canonicalization**

Group verified records by `marketplaceEvidenceId(record)`. Canonical selection comparator:

```text
newest retrieved_at → smaller source_url → lower original input index
```

Move non-canonical records into `duplicates` and preserve the retained evidence ID.

- [ ] **Step 4: Write failing source-equivalent tests**

Add same-platform buyer records with distinct source IDs but:

```text
same canonical source URL after query/fragment removal
same title after NFKC + trim + whitespace collapse + lowercase
```

Assert one is retained and one gets `reason: 'source_equivalent'`.

Also assert that cross-platform lookalikes and near-title/fuzzy lookalikes remain distinct.

- [ ] **Step 5: Implement conservative source-equivalent dedupe**

Implement dedupe-only URL normalization:

```ts
const parsed = new URL(sourceUrl);
parsed.hostname = parsed.hostname.toLowerCase();
parsed.search = '';
parsed.hash = '';
```

Remove a trailing slash from non-root paths. If URL construction fails, skip Stage-2 dedupe for that record. Normalize title using `normalize('NFKC')`, trim, `/\s+/g` collapse, and `toLowerCase()`.

Apply Stage 2 only to buyer opportunities on the same platform.

- [ ] **Step 6: Lock deterministic output ordering**

Sort:

```text
accepted/intelligence by evidence ID ascending
duplicates by retained evidence ID then duplicate original index
rejected by original input index
```

- [ ] **Step 7: Run aggregator + full core tests to GREEN**

Run focused aggregator tests followed by `npm test`.

- [ ] **Step 8: Commit**

Commit message:

```text
feat: deduplicate marketplace evidence deterministically
```

### Task 3: Validate and join derived scoring inputs

**Files:**
- Modify: `packages/core/src/aggregator.ts`
- Modify: `packages/core/test/aggregator.test.mjs`

**Interfaces:**
- Consumes: canonical accepted buyers from Task 2.
- Produces: per-buyer ranking disposition `missing_scoring_inputs` or `duplicate_scoring_inputs`, `invalidScoringInputs`, and stats `invalidScoringInputs` / `unusedScoringInputs`.

- [ ] **Step 1: Write failing scoring-validation tests**

Test that an individual malformed scoring row, e.g.:

```js
{evidence_id: '', capabilityFit: 80, evidenceQuality: 80, effortPoints: 2, deadlineUrgency: 30}
```

is recorded in `invalidScoringInputs` with `invalid_scoring_input`, while a valid neighboring row remains usable.

Also test invalid numeric shapes, boolean masquerading as number, negative/non-integer `expectedValueCents`, and missing required scoring fields.

- [ ] **Step 2: Run focused scoring tests to verify RED**

Expected: FAIL because scoring rows are not validated/joined yet.

- [ ] **Step 3: Implement scoring-row runtime validation**

A valid row requires:

```text
non-null object
non-blank evidence_id
finite number capabilityFit
finite number evidenceQuality
finite number effortPoints
finite number deadlineUrgency
expectedValueCents absent OR non-negative integer
```

Do not throw for malformed individual rows; record original scoring-input index and stable reason code.

- [ ] **Step 4: Write failing join/disposition tests**

Cover:

- zero valid rows → accepted buyer with `missing_scoring_inputs`;
- exactly one valid row → rank-eligible;
- two valid rows for same buyer → `duplicate_scoring_inputs`, not rank-eligible;
- valid row for service listing → does not rank service listing;
- valid row for no canonical buyer → increments `stats.unusedScoringInputs` and creates no opportunity.

- [ ] **Step 5: Implement scoring grouping/join**

Group only valid rows by `evidence_id`. Join after evidence dedupe so duplicate source records do not each consume scoring rows.

Ensure accepted buyer records carry their ranking disposition without mutating source evidence.

- [ ] **Step 6: Run focused + full tests to GREEN**

Run aggregator tests and `npm test`.

- [ ] **Step 7: Commit**

Commit message:

```text
feat: join explicit opportunity scoring inputs
```

### Task 4: Reuse existing ranker and build deterministic shortlist

**Files:**
- Modify: `packages/core/src/aggregator.ts`
- Modify: `packages/core/test/aggregator.test.mjs`

**Interfaces:**
- Consumes: `rankOpportunities()` from `./opportunity.ts`.
- Produces: `ShortlistedOpportunity[]` plus accepted buyer ranking dispositions `shortlisted` / `ranked_not_shortlisted`.

- [ ] **Step 1: Write failing ranking and Top-N tests**

Create three canonical verified buyers with complete scoring rows and `shortlistLimit: 2`. Assert the shortlist order exactly matches `rankOpportunities()` and that the third buyer remains accepted with `ranked_not_shortlisted`.

- [ ] **Step 2: Write failing unknown-value test**

Supply a valid scoring row without `expectedValueCents`; assert the derived ranking candidate omits/keeps it `undefined` and no source or aggregate output fabricates an expected value.

- [ ] **Step 3: Run focused tests to verify RED**

Expected: FAIL because ranking/shortlisting has not been wired yet.

- [ ] **Step 4: Implement ranker reuse**

Map each rank-eligible buyer to the existing ranker shape:

```ts
{
  id: evidenceId,
  capabilityFit: scoring.capabilityFit,
  evidenceQuality: scoring.evidenceQuality,
  expectedValueCents: scoring.expectedValueCents,
  effortPoints: scoring.effortPoints,
  deadlineUrgency: scoring.deadlineUrgency,
}
```

Call `rankOpportunities()` exactly once for the eligible set. Do not duplicate the score formula.

- [ ] **Step 5: Implement shortlist projection**

Take `ranked.slice(0, shortlistLimit)`. Attach score only to aggregate/ranking output. Update accepted ranking dispositions to `shortlisted` or `ranked_not_shortlisted` based on evidence ID membership.

- [ ] **Step 6: Add determinism/non-mutation regression tests**

Deep-freeze or deep-clone input fixtures, call aggregation twice, and assert:

```js
assert.deepEqual(first, second);
assert.deepEqual(evidence, originalEvidence);
assert.deepEqual(scoringInputs, originalScoring);
assert.equal(JSON.stringify(first), JSON.stringify(second));
```

- [ ] **Step 7: Run full Node suite to GREEN**

Run `npm test`.

- [ ] **Step 8: Commit**

Commit message:

```text
feat: rank and shortlist verified buyer opportunities
```

### Task 5: Enforce pure-core dependency boundary

**Files:**
- Modify: `packages/core/test/aggregator.test.mjs`
- Modify: `packages/core/src/aggregator.ts` only if regression requires it

**Interfaces:**
- Guarantees aggregator remains free of provider/network/persistence/execution dependencies.

- [ ] **Step 1: Write source-boundary regression test**

Read `packages/core/src/aggregator.ts` and assert it does not import or reference prohibited runtime dependencies/entry points, including:

```text
connectors/
mcp
requests
fetch(
postgres
createWorkOrder
BuildGraphClient
authorizeAction
executeFactory
send_message
purchase
payment
```

Allow imports only from core source/opportunity modules needed for this transformation.

- [ ] **Step 2: Run focused regression test**

Expected: PASS if architecture stayed pure; if it fails, remove the offending dependency rather than weakening the test.

- [ ] **Step 3: Run typecheck and smoke verification**

Run:

```bash
npm run typecheck
npm run smoke
```

Expected: PASS.

- [ ] **Step 4: Commit**

Commit message:

```text
test: lock aggregator execution boundary
```

### Task 6: Document aggregator pipeline and verify stacked PR

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/superpowers/specs/2026-08-12-opportunity-aggregator-design.md` status line only after implementation is verified
- Modify: `docs/superpowers/plans/2026-08-12-opportunity-aggregator.md` checkboxes/status only after verification

**Interfaces:**
- Documentation must describe shortlist as analysis output, not a bid/application/WorkOrder/fulfillment queue.

- [ ] **Step 1: Update repository architecture docs**

Document:

```text
SOURCE ADAPTERS
  → VERIFIED MARKETPLACE EVIDENCE
  → AGGREGATE / CLASSIFY / DEDUPE
  → JOIN DERIVED SCORING INPUTS
  → EXISTING DETERMINISTIC RANKER
  → TOP-N SHORTLIST
  → future orchestration boundary
```

State explicitly that Fiverr `service_listing` records stay intelligence-only and that shortlist generation has no external side effects.

- [ ] **Step 2: Run complete verification**

Run:

```bash
npm test
pytest -q connectors/freelancer/tests connectors/fiverr/tests
python -m py_compile connectors/freelancer/freelancer_mcp_server.py connectors/fiverr/fiverr_mcp_server.py
npm run typecheck
npm run smoke
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Update spec status and plan completion markers**

Change the spec status to implementation complete / exact-head review pending only after the complete suite passes. Mark completed plan steps accurately; do not mark final PR acceptance before CI evidence exists.

- [ ] **Step 4: Open stacked draft PR**

Open a draft PR:

```text
head: codex/opportunity-aggregator
base: codex/fiverr-source-adapter
```

PR body must explain that it is intentionally stacked on Fiverr PR #7 and contains no provider retrieval or execution changes.

- [ ] **Step 5: Inspect exact PR head and GitHub Actions**

Verify the PR head SHA is the branch SHA tested by CI. If CI fails, diagnose the exact failing step, add a regression test for code-related failures, patch, and rerun.

- [ ] **Step 6: Perform exact-head diff acceptance review**

Confirm the diff introduces no provider API calls, persistence, WorkOrder creation, marketplace writes, fuzzy duplicate logic, fabricated scoring values, or second ranking formula.

- [ ] **Step 7: Leave PR draft and unmerged**

Do not merge, deploy, retarget to `main`, or activate any runtime path in this tranche.
