# Commercial Intelligence Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert verified public-demand candidates into evidence-bound commercial investigation packets with structured economic pain, verified BuildGraph capability proof, defensible value estimates, P0/P0-Critical classification, winability, revalidation, and approval-readiness while never authorizing external outreach.

**Architecture:** Add focused deterministic modules under `packages/core/src/` and keep network access outside core. The assembler consumes `PublicDemandCandidate`, verified BuildGraph evidence, explicit eligibility evidence, caller-supplied time/cost inputs, and deterministic investigation-task resolution evidence, then returns a `CriticalInvestigationPacket` with `externalActionAllowed: false`.

**Tech Stack:** TypeScript 6, Node.js 22, Node built-in test runner, existing OpportunityOS core contracts, existing BuildGraph preflight contract, canonical SHA-256 utilities.

## Global Constraints

- Stack on `codex/public-demand-collectors-v1`; do not modify or merge PR #19.
- No external write methods, provider posting, messaging, proposals, contracts, purchases, payments, or production deployment.
- Evidence before facts; inferences must be labeled.
- Unknown values remain `null`, never implicit zero.
- Economic exposure must remain separate from contract value.
- P0-Critical is mandatory investigation, not pursuit authorization.
- `P0_CRITICAL / BUDGET` threshold: verified USD budget/fixed-contract/ceiling >= $1,000,000.
- `P0_CRITICAL / RECOVERABLE_LOSS` threshold: verified explicitly recoverable USD loss/exposure >= $1,000,000.
- Non-critical explicit-budget P0 threshold: >= $100,000 with buyer intent >= 0.70 and credibility >= 0.70.
- Revalidation windows: P0-Critical 6h; P0 24h; Strong 72h; Monitor 7d.
- Win probability is explicitly `UNCALIBRATED_V1` until historical outcomes support calibration.
- Do not invent a new BuildGraph endpoint.

## File Structure

Create:

- `packages/core/src/economic-pain.ts` — parse verified monetary observations and semantic amount kinds.
- `packages/core/src/commercial-buildgraph.ts` — deterministic verified BuildGraph cross-match.
- `packages/core/src/commercial-eligibility.ts` — evidence-driven eligibility assessment.
- `packages/core/src/commercial-value.ts` — contract-value estimate and pursuit economics.
- `packages/core/src/commercial-winability.ts` — uncalibrated win probability with unknown-aware confidence.
- `packages/core/src/commercial-priority.ts` — P0/P0-Critical policy overlay.
- `packages/core/src/opportunity-revalidation.ts` — deterministic aging/revalidation gate.
- `packages/core/src/critical-investigation.ts` — final commercial-intelligence assembler and packet.

Create tests with matching names under `packages/core/test/`.

Modify:

- `packages/core/src/index.ts` — export the new modules.
- `README.md` — document Commercial Intelligence Engine boundary after exact-head acceptance.

---

### Task 1: Structured Economic Pain Extraction

**Files:**
- Create: `packages/core/test/economic-pain.test.mjs`
- Create: `packages/core/src/economic-pain.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `DemandFact`, `VerificationState` from `./acquisition.ts`.
- Produces:

```ts
export type EconomicAmountKind =
  | 'EXPLICIT_BUDGET'
  | 'FIXED_CONTRACT_VALUE'
  | 'BUDGET_RANGE'
  | 'RECOVERABLE_LOSS'
  | 'REVENUE_EXPOSURE'
  | 'LABOR_COST'
  | 'COST_SAVINGS'
  | 'OTHER_EXPOSURE';

export interface ObservedEconomicAmount {
  kind: EconomicAmountKind;
  minCents: number | null;
  maxCents: number | null;
  currency: 'USD';
  statement: string;
  evidenceRefs: string[];
  confidence: number;
  observedOnly: true;
}

export interface EconomicPainReport {
  amounts: ObservedEconomicAmount[];
  contradictions: string[];
  evidenceRefs: string[];
}

export function extractObservedEconomicPain(input: {
  facts: DemandFact[];
  verificationState: VerificationState;
}): EconomicPainReport;
```

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {extractObservedEconomicPain} from '../src/economic-pain.ts';

function fact(statement) {
  return {statement, evidenceRefs: ['source:1']};
}

test('$1.4M budget is preserved as explicit verified budget evidence', () => {
  const result = extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('Approved software budget is $1.4M for this procurement.')],
  });
  assert.equal(result.amounts[0].kind, 'EXPLICIT_BUDGET');
  assert.equal(result.amounts[0].maxCents, 140_000_000);
  assert.deepEqual(result.amounts[0].evidenceRefs, ['source:1']);
});

test('$1.4M recoverable loss is exposure rather than contract value', () => {
  const result = extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('We have $1.4M of recoverable billing loss caused by the current workflow.')],
  });
  assert.equal(result.amounts[0].kind, 'RECOVERABLE_LOSS');
  assert.equal(result.amounts[0].maxCents, 140_000_000);
});

test('ambiguous impact remains OTHER_EXPOSURE', () => {
  const result = extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('The annual impact is $1.4M.')],
  });
  assert.equal(result.amounts[0].kind, 'OTHER_EXPOSURE');
});

test('budget ranges preserve min and max', () => {
  const result = extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('Budget range is $500k-$1.4M for the implementation.')],
  });
  assert.equal(result.amounts[0].kind, 'BUDGET_RANGE');
  assert.equal(result.amounts[0].minCents, 50_000_000);
  assert.equal(result.amounts[0].maxCents, 140_000_000);
});

test('unverified demand cannot create economic amounts', () => {
  assert.throws(() => extractObservedEconomicPain({
    verificationState: 'UNVERIFIED',
    facts: [fact('Budget $1.4M')],
  }), /COMMERCIAL_SOURCE_NOT_VERIFIED/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/economic-pain.test.mjs
```

Expected: FAIL because `../src/economic-pain.ts` does not exist.

- [ ] **Step 3: Implement the minimal parser**

Use a range-first money parser so `$500k-$1.4M` is not emitted as two unrelated amounts. Classify semantics from the full source statement.

Core helpers:

```ts
const MONEY = /\$\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*([kKmM])?/g;
const RANGE = /\$\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*([kKmM])?\s*(?:-|to)\s*\$?\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*([kKmM])?/i;

function toCents(raw: string, suffix: string | undefined): number {
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) throw new TypeError('ECONOMIC_AMOUNT_INVALID');
  const multiplier = suffix?.toLowerCase() === 'm' ? 1_000_000
    : suffix?.toLowerCase() === 'k' ? 1_000 : 1;
  return Math.round(value * multiplier * 100);
}

function classifyAmountKind(statement: string, isRange: boolean): EconomicAmountKind {
  const text = statement.toLowerCase();
  if (/recoverable/.test(text) && /(loss|revenue|billing|payment)/.test(text)) return 'RECOVERABLE_LOSS';
  if (/(fixed contract|contract value|contract amount)/.test(text)) return 'FIXED_CONTRACT_VALUE';
  if (/budget/.test(text) && isRange) return 'BUDGET_RANGE';
  if (/budget/.test(text)) return 'EXPLICIT_BUDGET';
  if (/(lost revenue|revenue exposure|revenue at risk)/.test(text)) return 'REVENUE_EXPOSURE';
  if (/(labor cost|staff cost|payroll cost)/.test(text)) return 'LABOR_COST';
  if (/(cost savings|save|savings)/.test(text)) return 'COST_SAVINGS';
  return 'OTHER_EXPOSURE';
}
```

For each fact, require non-empty `evidenceRefs`, emit canonical source statement unchanged, and deduplicate identical `{kind,min,max,statement}` observations.

- [ ] **Step 4: Run targeted and full core tests**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/economic-pain.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Export and commit**

Add `export * from './economic-pain.ts';` to `packages/core/src/index.ts`.

Commit message:

```text
feat: extract verified economic pain amounts
```

---

### Task 2: Verified BuildGraph Commercial Cross-Match

**Files:**
- Create: `packages/core/test/commercial-buildgraph.test.mjs`
- Create: `packages/core/src/commercial-buildgraph.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `BuildGraphPreflightResult`, `BuildGraphDecision` from `./buildgraph.ts`.
- Produces:

```ts
export interface VerifiedBuildGraphEvidenceItem {
  id: string;
  kind: 'PROJECT' | 'CAPABILITY' | 'ARTIFACT';
  title: string;
  description: string;
  tags: string[];
  verified: boolean;
  evidenceRefs: string[];
}

export interface BuildGraphCommercialEvidence {
  preflight: BuildGraphPreflightResult;
  items: VerifiedBuildGraphEvidenceItem[];
}

export interface CommercialCapabilityMatch {
  state: 'VERIFIED_MATCH' | 'PARTIAL_MATCH' | 'EVIDENCE_GAP';
  score: number | null;
  projectIds: string[];
  capabilityIds: string[];
  artifactIds: string[];
  evidenceRefs: string[];
  reuseDecision: BuildGraphDecision | null;
  proofPlan: string[];
}

export function crossMatchBuildGraphCommercialEvidence(input: {
  demandText: string;
  evidence: BuildGraphCommercialEvidence | null;
}): CommercialCapabilityMatch;
```

- [ ] **Step 1: Write failing tests**

Test verified overlap, unverified-item exclusion, IDs-without-proof, and evidence gap.

```js
test('verified BuildGraph evidence produces a verified capability match', () => {
  const result = crossMatchBuildGraphCommercialEvidence({
    demandText: 'Need an AI workflow automation and CRM integration',
    evidence: {
      preflight: preflight({decision: 'EXTEND_EXISTING'}),
      items: [{
        id: 'project:opportunityos', kind: 'PROJECT', title: 'OpportunityOS',
        description: 'AI workflow automation and CRM opportunity routing',
        tags: ['ai', 'automation', 'crm'], verified: true,
        evidenceRefs: ['buildgraph:project:opportunityos'],
      }],
    },
  });
  assert.equal(result.state, 'VERIFIED_MATCH');
  assert.ok(result.score >= 0.7);
  assert.deepEqual(result.projectIds, ['project:opportunityos']);
});

test('unverified BuildGraph IDs cannot manufacture proof', () => {
  const result = crossMatchBuildGraphCommercialEvidence({
    demandText: 'AI automation',
    evidence: {
      preflight: preflight({
        evidence: {projectIds: ['project:imaginary'], constraintIds: [], decisionIds: []},
      }),
      items: [{
        id: 'project:imaginary', kind: 'PROJECT', title: 'Imaginary',
        description: 'AI automation', tags: ['ai'], verified: false, evidenceRefs: [],
      }],
    },
  });
  assert.equal(result.state, 'EVIDENCE_GAP');
  assert.equal(result.score, null);
});
```

The local `preflight()` fixture must always match the repository's existing `BuildGraphPreflightResult` exactly, including `evidence: {projectIds, constraintIds, decisionIds}` and no invented `capabilityIds` property.

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-buildgraph.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement deterministic token overlap**

Use a local tokenizer patterned after `public-demand.ts`; do not call BuildGraph from this function.

```ts
function verifiedItems(items: VerifiedBuildGraphEvidenceItem[]): VerifiedBuildGraphEvidenceItem[] {
  return items.filter((item) => item.verified && item.evidenceRefs.length > 0 && item.id.trim());
}
```

Score each verified item by matched demand terms divided by the smaller unique-term set, capped at 1.0. The best item determines the match score. `>= 0.70` -> `VERIFIED_MATCH`; `> 0` -> `PARTIAL_MATCH`; no verified overlap -> `EVIDENCE_GAP` and a proof plan containing `VERIFY_BUILDGRAPH_CAPABILITY_EVIDENCE`.

Pass through `preflight.decision` as `reuseDecision` only when `preflight.payloadHash` and `preflight.requestId` are present.

- [ ] **Step 4: Verify GREEN and regressions**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-buildgraph.test.mjs
npm test
```

- [ ] **Step 5: Export and commit**

Commit message:

```text
feat: cross match verified BuildGraph capability evidence
```

---

### Task 3: Evidence-Driven Eligibility

**Files:**
- Create: `packages/core/test/commercial-eligibility.test.mjs`
- Create: `packages/core/src/commercial-eligibility.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export type EligibilityCheckKind =
  | 'BUYER_LEGITIMACY'
  | 'GEOGRAPHY'
  | 'QUALIFICATION'
  | 'DEADLINE'
  | 'CAPABILITY_PROOF';

export interface EligibilityCheck {
  kind: EligibilityCheckKind;
  state: 'PASS' | 'FAIL' | 'UNKNOWN';
  statement: string;
  hardDisqualifier: boolean;
  evidenceRefs: string[];
}

export interface EligibilityAssessment {
  state: 'ELIGIBLE' | 'PARTIAL' | 'UNKNOWN' | 'DISQUALIFIED';
  checks: EligibilityCheck[];
  hardDisqualifiers: string[];
  missingEvidence: string[];
  evidenceRefs: string[];
}

export function assessCommercialEligibility(checks: EligibilityCheck[]): EligibilityAssessment;
```

- [ ] **Step 1: Write failing tests**

Cover all-pass, unknown, partial, and hard fail.

```js
test('absence of an eligibility fact remains UNKNOWN', () => {
  const result = assessCommercialEligibility([]);
  assert.equal(result.state, 'UNKNOWN');
  assert.ok(result.missingEvidence.length > 0);
});

test('hard qualification failure disqualifies pursuit', () => {
  const result = assessCommercialEligibility([{
    kind: 'QUALIFICATION', state: 'FAIL', statement: 'Required certification is not held',
    hardDisqualifier: true, evidenceRefs: ['rfp:qualification:1'],
  }]);
  assert.equal(result.state, 'DISQUALIFIED');
  assert.equal(result.hardDisqualifiers.length, 1);
});
```

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-eligibility.test.mjs
```

- [ ] **Step 3: Implement minimal deterministic aggregation**

Rules:

- hard `FAIL` -> `DISQUALIFIED`
- no checks -> `UNKNOWN`
- all checks `PASS` -> `ELIGIBLE`
- mix of `PASS` and `UNKNOWN` -> `PARTIAL`
- all `UNKNOWN` -> `UNKNOWN`
- a non-hard `FAIL` -> `PARTIAL`, never silently eligible
- any `PASS` or `FAIL` check requires evidence refs; `UNKNOWN` may have none

- [ ] **Step 4: Run GREEN and full tests**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-eligibility.test.mjs
npm test
```

- [ ] **Step 5: Export and commit**

```text
feat: add evidence driven commercial eligibility
```

---

### Task 4: Contract Value and Pursuit Economics

**Files:**
- Create: `packages/core/test/commercial-value.test.mjs`
- Create: `packages/core/src/commercial-value.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ObservedEconomicAmount` from `./economic-pain.ts`.
- Produces:

```ts
export interface ContractValueEstimate {
  minCents: number | null;
  expectedCents: number | null;
  maxCents: number | null;
  currency: 'USD' | null;
  confidence: number;
  basis: 'FIXED_CONTRACT' | 'BUDGET_RANGE' | 'BUDGET_CEILING' | 'INSUFFICIENT_EVIDENCE';
  evidenceRefs: string[];
  assumptions: string[];
}

export interface CommercialValueReport {
  observedBudget: ObservedEconomicAmount[];
  observedExposure: ObservedEconomicAmount[];
  contractValue: ContractValueEstimate;
}

export interface PursuitEconomics {
  expectedContractValueCents: number | null;
  modeledWinProbability: number | null;
  expectedGrossPursuitValueCents: number | null;
  estimatedPursuitCostCents: number | null;
  expectedNetPursuitValueCents: number | null;
  currency: 'USD' | null;
}

export function estimateCommercialValue(amounts: ObservedEconomicAmount[]): CommercialValueReport;
export function calculatePursuitEconomics(input: {
  contractValue: ContractValueEstimate;
  winProbability: number | null;
  estimatedPursuitCostCents: number | null;
}): PursuitEconomics;
```

- [ ] **Step 1: Write failing tests**

```js
test('fixed contract amount may become exact expected contract value', () => {
  const result = estimateCommercialValue([amount('FIXED_CONTRACT_VALUE', 140_000_000, 140_000_000)]);
  assert.equal(result.contractValue.expectedCents, 140_000_000);
  assert.equal(result.contractValue.basis, 'FIXED_CONTRACT');
});

test('single budget ceiling does not fabricate expected contract value', () => {
  const result = estimateCommercialValue([amount('EXPLICIT_BUDGET', 140_000_000, 140_000_000)]);
  assert.equal(result.contractValue.expectedCents, null);
  assert.equal(result.contractValue.maxCents, 140_000_000);
  assert.equal(result.contractValue.basis, 'BUDGET_CEILING');
});

test('recoverable loss remains exposure and cannot become contract price', () => {
  const result = estimateCommercialValue([amount('RECOVERABLE_LOSS', 140_000_000, 140_000_000)]);
  assert.equal(result.contractValue.expectedCents, null);
  assert.equal(result.observedExposure.length, 1);
});

test('pursuit EV remains unknown without expected contract value', () => {
  const economics = calculatePursuitEconomics({
    contractValue: estimateCommercialValue([amount('EXPLICIT_BUDGET', 140_000_000, 140_000_000)]).contractValue,
    winProbability: 0.4,
    estimatedPursuitCostCents: 50_000,
  });
  assert.equal(economics.expectedGrossPursuitValueCents, null);
  assert.equal(economics.expectedNetPursuitValueCents, null);
});
```

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-value.test.mjs
```

- [ ] **Step 3: Implement exact evidence rules**

Selection precedence:

1. highest fixed-contract evidence -> exact expected value
2. highest verified budget range -> range with midpoint assumption
3. highest single budget -> ceiling only, expected null
4. otherwise insufficient evidence

Do not use recoverable loss/revenue exposure in contract pricing.

For economics:

```ts
const gross = expected !== null && probability !== null
  ? Math.round(expected * probability)
  : null;
const net = gross !== null && cost !== null ? gross - cost : null;
```

Validate probability 0..1 and cost as non-negative integer/null.

- [ ] **Step 4: Run GREEN and regressions**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-value.test.mjs
npm test
```

- [ ] **Step 5: Export and commit**

```text
feat: model commercial value and pursuit economics
```

---

### Task 5: Uncalibrated Win Probability

**Files:**
- Create: `packages/core/test/commercial-winability.test.mjs`
- Create: `packages/core/src/commercial-winability.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export interface WinabilityInputs {
  capabilityEvidence: number | null;
  eligibility: number | null;
  buyerIntent: number | null;
  credibility: number | null;
  scopeFit: number | null;
  reuseEfficiency: number | null;
  freshnessUrgency: number | null;
  competitionCloseability: number | null;
  hardDisqualifiers: string[];
  evidenceRefs: string[];
}

export interface WinProbabilityEstimate {
  probability: number | null;
  confidence: number;
  calibrationState: 'UNCALIBRATED_V1';
  knownInputs: string[];
  unknownInputs: string[];
  evidenceRefs: string[];
  reasons: string[];
}

export function estimateWinProbability(input: WinabilityInputs): WinProbabilityEstimate;
```

Weights are exactly:

```ts
const WEIGHTS = {
  capabilityEvidence: 25,
  eligibility: 20,
  buyerIntent: 15,
  credibility: 10,
  scopeFit: 10,
  reuseEfficiency: 10,
  freshnessUrgency: 5,
  competitionCloseability: 5,
} as const;
```

- [ ] **Step 1: Write failing tests**

```js
test('unknown win factors reduce confidence rather than act as zeroes', () => {
  const partial = estimateWinProbability({
    capabilityEvidence: 0.9, eligibility: null, buyerIntent: 0.9, credibility: 0.8,
    scopeFit: null, reuseEfficiency: 0.8, freshnessUrgency: 1,
    competitionCloseability: null, hardDisqualifiers: [], evidenceRefs: ['e:1'],
  });
  assert.ok(partial.probability > 0.7);
  assert.ok(partial.confidence < 1);
  assert.ok(partial.unknownInputs.includes('eligibility'));
});

test('hard eligibility disqualifier forces zero probability', () => {
  const result = estimateWinProbability({
    capabilityEvidence: 1, eligibility: 1, buyerIntent: 1, credibility: 1,
    scopeFit: 1, reuseEfficiency: 1, freshnessUrgency: 1,
    competitionCloseability: 1, hardDisqualifiers: ['CERTIFICATION_REQUIRED'], evidenceRefs: ['e:1'],
  });
  assert.equal(result.probability, 0);
  assert.ok(result.reasons.includes('HARD_DISQUALIFIER'));
});
```

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-winability.test.mjs
```

- [ ] **Step 3: Implement unknown-aware weighted mean**

For known values only:

```ts
probability = weightedTotal / knownWeight;
confidence = knownWeight / 100;
```

Round both to 4 decimals. If `knownWeight === 0`, probability is `null`, confidence is 0. Validate every known factor is 0..1.

- [ ] **Step 4: Run GREEN and regressions**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-winability.test.mjs
npm test
```

- [ ] **Step 5: Export and commit**

```text
feat: add uncalibrated commercial winability model
```

---

### Task 6: Commercial P0 / P0-Critical Policy

**Files:**
- Create: `packages/core/test/commercial-priority.test.mjs`
- Create: `packages/core/src/commercial-priority.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `PublicDemandCandidate`, `EconomicPainReport`, `CommercialValueReport`, `EligibilityAssessment`.
- Produces:

```ts
export type CommercialPriority = 'P0_CRITICAL' | 'P0' | 'STRONG' | 'MONITOR' | 'REJECT';
export type CriticalReason = 'BUDGET' | 'RECOVERABLE_LOSS';

export interface CommercialPriorityResult {
  priority: CommercialPriority;
  criticalReason: CriticalReason | null;
  reasons: string[];
  externalActionAllowed: false;
}

export function classifyCommercialPriority(input: {
  candidate: PublicDemandCandidate;
  pain: EconomicPainReport;
  value: CommercialValueReport;
  eligibility: EligibilityAssessment;
}): CommercialPriorityResult;
```

- [ ] **Step 1: Write failing policy tests**

Required cases:

```js
test('verified $1.4M explicit budget is P0_CRITICAL / BUDGET', () => {
  const result = classifyCommercialPriority(policyInput({amountKind: 'EXPLICIT_BUDGET', amountCents: 140_000_000}));
  assert.equal(result.priority, 'P0_CRITICAL');
  assert.equal(result.criticalReason, 'BUDGET');
  assert.equal(result.externalActionAllowed, false);
});

test('verified $1.4M recoverable loss is P0_CRITICAL / RECOVERABLE_LOSS', () => {
  const result = classifyCommercialPriority(policyInput({amountKind: 'RECOVERABLE_LOSS', amountCents: 140_000_000}));
  assert.equal(result.priority, 'P0_CRITICAL');
  assert.equal(result.criticalReason, 'RECOVERABLE_LOSS');
});

test('hard scam reject overrides seven-figure amount', () => {
  const input = policyInput({amountKind: 'EXPLICIT_BUDGET', amountCents: 140_000_000});
  input.candidate.credibility.reject = true;
  const result = classifyCommercialPriority(input);
  assert.equal(result.priority, 'REJECT');
});

test('weak capability fit does not suppress valid P0-Critical budget', () => {
  const input = policyInput({amountKind: 'EXPLICIT_BUDGET', amountCents: 140_000_000});
  input.candidate.portfolioMatches = [];
  const result = classifyCommercialPriority(input);
  assert.equal(result.priority, 'P0_CRITICAL');
});
```

Also test unverified signal -> reject and $150K credible explicit budget -> P0.

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-priority.test.mjs
```

- [ ] **Step 3: Implement the policy in strict order**

1. Reject if signal verification state is not `VERIFIED`.
2. Reject if `candidate.credibility.reject`.
3. Reject if `eligibility.state === 'DISQUALIFIED'`.
4. Find max qualifying USD P0-Critical budget amount.
5. Find max explicit-recoverable USD loss amount.
6. Apply P0-Critical rules before ordinary P0.
7. Apply P0 rules from upstream `PRIORITY_0` or explicit >= $100K + intent/credibility >= .70.
8. Map upstream `STRONG` -> `STRONG`, `MONITOR` -> `MONITOR`, otherwise `REJECT`.

`externalActionAllowed` is a literal `false` in every return branch.

- [ ] **Step 4: Run GREEN and regressions**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/commercial-priority.test.mjs
npm test
```

- [ ] **Step 5: Export and commit**

```text
feat: classify P0 critical commercial opportunities
```

---

### Task 7: Opportunity Aging and Revalidation

**Files:**
- Create: `packages/core/test/opportunity-revalidation.test.mjs`
- Create: `packages/core/src/opportunity-revalidation.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export type RevalidationState = 'CURRENT' | 'REVALIDATION_DUE' | 'STALE' | 'INVALIDATED';

export interface RevalidationAssessment {
  state: RevalidationState;
  ageMs: number;
  revalidateAfterMs: number | null;
  dueAt: string | null;
  reasons: string[];
  evidenceRefs: string[];
}

export function assessOpportunityRevalidation(input: {
  priority: CommercialPriority;
  retrievedAt: string;
  lastRevalidatedAt: string | null;
  now: string;
  originalContentFingerprint: string;
  currentContentFingerprint: string | null;
  sourceStillActive: boolean | null;
  revalidationEvidenceRefs: string[];
}): RevalidationAssessment;
```

- [ ] **Step 1: Write failing time tests**

```js
test('P0-Critical becomes due after six hours', () => {
  const result = assessOpportunityRevalidation({
    priority: 'P0_CRITICAL', retrievedAt: '2026-08-16T10:00:00Z', lastRevalidatedAt: null,
    now: '2026-08-16T16:00:01Z', originalContentFingerprint: 'a', currentContentFingerprint: 'a',
    sourceStillActive: true, revalidationEvidenceRefs: [],
  });
  assert.equal(result.state, 'REVALIDATION_DUE');
});

test('evidence-backed revalidation resets the critical age window', () => {
  const result = assessOpportunityRevalidation({
    priority: 'P0_CRITICAL', retrievedAt: '2026-08-16T10:00:00Z', lastRevalidatedAt: '2026-08-16T15:30:00Z',
    now: '2026-08-16T16:00:01Z', originalContentFingerprint: 'a', currentContentFingerprint: 'a',
    sourceStillActive: true, revalidationEvidenceRefs: ['source:revalidated'],
  });
  assert.equal(result.state, 'CURRENT');
});

test('lastRevalidatedAt without evidence is rejected', () => {
  assert.throws(() => assessOpportunityRevalidation({
    priority: 'P0_CRITICAL', retrievedAt: '2026-08-16T10:00:00Z', lastRevalidatedAt: '2026-08-16T15:30:00Z',
    now: '2026-08-16T16:00:01Z', originalContentFingerprint: 'a', currentContentFingerprint: 'a',
    sourceStillActive: true, revalidationEvidenceRefs: [],
  }), /REVALIDATION_EVIDENCE_REQUIRED/);
});

test('content fingerprint change requires full re-analysis', () => {
  const result = assessOpportunityRevalidation({
    priority: 'P0', retrievedAt: '2026-08-16T10:00:00Z', lastRevalidatedAt: null,
    now: '2026-08-16T11:00:00Z', originalContentFingerprint: 'a', currentContentFingerprint: 'b',
    sourceStillActive: true, revalidationEvidenceRefs: ['source:changed'],
  });
  assert.equal(result.state, 'STALE');
  assert.ok(result.reasons.includes('CONTENT_CHANGED'));
});

test('closed or deleted source invalidates opportunity', () => {
  const result = assessOpportunityRevalidation({
    priority: 'P0_CRITICAL', retrievedAt: '2026-08-16T10:00:00Z', lastRevalidatedAt: null,
    now: '2026-08-16T10:30:00Z', originalContentFingerprint: 'a', currentContentFingerprint: 'a',
    sourceStillActive: false, revalidationEvidenceRefs: ['source:closed'],
  });
  assert.equal(result.state, 'INVALIDATED');
});
```

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/opportunity-revalidation.test.mjs
```

- [ ] **Step 3: Implement deterministic TTL policy**

```ts
const TTL_MS = {
  P0_CRITICAL: 6 * 60 * 60 * 1000,
  P0: 24 * 60 * 60 * 1000,
  STRONG: 72 * 60 * 60 * 1000,
  MONITOR: 7 * 24 * 60 * 60 * 1000,
  REJECT: null,
} as const;
```

If `lastRevalidatedAt !== null`, require non-empty `revalidationEvidenceRefs` and use `lastRevalidatedAt` as the effective freshness baseline. Otherwise use `retrievedAt`.

Rules in order: invalid source -> `INVALIDATED`; changed fingerprint -> `STALE`; age beyond TTL -> `REVALIDATION_DUE`; otherwise `CURRENT`. Invalid ISO timestamps throw.

- [ ] **Step 4: Run GREEN and regressions**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/opportunity-revalidation.test.mjs
npm test
```

- [ ] **Step 5: Export and commit**

```text
feat: add commercial opportunity revalidation policy
```

---

### Task 8: Critical Investigation Packet Assembly

**Files:**
- Create: `packages/core/test/critical-investigation.test.mjs`
- Create: `packages/core/test/commercial-intelligence-authority.test.mjs`
- Create: `packages/core/src/critical-investigation.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes all modules from Tasks 1-7 plus `FactVsInference` and `PublicDemandCandidate`.
- Produces:

```ts
export interface InvestigationTask {
  id: string;
  kind: 'REVALIDATE_SOURCE' | 'PROVE_CAPABILITY' | 'VERIFY_ELIGIBILITY' | 'RESOLVE_VALUE_SEMANTICS' | 'FALSIFY_OPPORTUNITY';
  description: string;
  required: boolean;
  evidenceRefs: string[];
}

export interface CriticalInvestigationPacket {
  id: string;
  opportunityId: string;
  priority: CommercialPriority;
  criticalReason: CriticalReason | null;
  sourceEvidenceRefs: string[];
  factVsInference: FactVsInference[];
  economicPain: EconomicPainReport;
  buildGraphMatch: CommercialCapabilityMatch;
  commercialValue: CommercialValueReport;
  eligibility: EligibilityAssessment;
  winProbability: WinProbabilityEstimate;
  pursuitEconomics: PursuitEconomics;
  revalidation: RevalidationAssessment;
  falsificationQuestions: string[];
  proofTasks: InvestigationTask[];
  missingEvidence: string[];
  approvalReadiness: 'NOT_READY' | 'READY_FOR_HUMAN_REVIEW';
  externalActionAllowed: false;
}

export function buildCommercialInvestigation(input: {
  candidate: PublicDemandCandidate;
  buildGraphEvidence: BuildGraphCommercialEvidence | null;
  eligibilityChecks: EligibilityCheck[];
  winabilityOverrides?: Partial<Pick<WinabilityInputs, 'scopeFit' | 'competitionCloseability'>>;
  estimatedPursuitCostCents: number | null;
  now: string;
  lastRevalidatedAt: string | null;
  currentContentFingerprint: string | null;
  sourceStillActive: boolean | null;
  revalidationEvidenceRefs: string[];
  resolvedInvestigationTaskIds: string[];
}): CriticalInvestigationPacket;
```

- [ ] **Step 1: Write the failing end-to-end tests**

Test two canonical cases.

**Case A: verified $1.4M software procurement budget**

- verified source candidate
- credible explicit buyer intent
- `$1.4M` explicit budget
- verified BuildGraph project/capability proof
- no hard eligibility failures
- current source

Assertions:

```js
assert.equal(packet.priority, 'P0_CRITICAL');
assert.equal(packet.criticalReason, 'BUDGET');
assert.equal(packet.commercialValue.contractValue.maxCents, 140_000_000);
assert.equal(packet.commercialValue.contractValue.expectedCents, null); // budget ceiling is not fixed contract
assert.equal(packet.externalActionAllowed, false);
assert.equal(packet.revalidation.state, 'CURRENT');
```

**Case B: verified $1.4M recoverable loss**

Assertions:

```js
assert.equal(packet.priority, 'P0_CRITICAL');
assert.equal(packet.criticalReason, 'RECOVERABLE_LOSS');
assert.equal(packet.commercialValue.contractValue.expectedCents, null);
assert.equal(packet.pursuitEconomics.expectedGrossPursuitValueCents, null);
```

Add stale critical test:

```js
assert.equal(packet.revalidation.state, 'REVALIDATION_DUE');
assert.equal(packet.approvalReadiness, 'NOT_READY');
assert.ok(packet.proofTasks.some((task) => task.kind === 'REVALIDATE_SOURCE'));
```

Add capability-gap test where priority remains P0-Critical but readiness is `NOT_READY` and `PROVE_CAPABILITY` is required.

Add a resolved-task test proving `READY_FOR_HUMAN_REVIEW` is reachable only when all deterministic required task IDs are supplied in `resolvedInvestigationTaskIds` and every other readiness gate passes.

- [ ] **Step 2: Run RED**

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/critical-investigation.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement orchestration in one deterministic function**

Order:

```ts
const pain = extractObservedEconomicPain(...);
const buildGraphMatch = crossMatchBuildGraphCommercialEvidence(...);
const eligibility = assessCommercialEligibility(...);
const commercialValue = estimateCommercialValue(pain.amounts);
const priorityResult = classifyCommercialPriority(...);
const revalidation = assessOpportunityRevalidation(...);
const winProbability = estimateWinProbability(...);
const pursuitEconomics = calculatePursuitEconomics(...);
```

Derive winability inputs without inventing missing facts:

- capabilityEvidence = BuildGraph score or null
- eligibility = `ELIGIBLE` -> 1; `PARTIAL` -> 0.6; `UNKNOWN` -> null; `DISQUALIFIED` -> 0
- buyerIntent = `candidate.intent.score`
- credibility = `candidate.credibility.credibilityScore`
- scopeFit = caller override or top verified portfolio match score or null
- reuseEfficiency = verified reuse decision plus evidence -> 0.8; `CREATE_NEW` -> null; no proof -> null
- freshnessUrgency = current critical/P0 -> 1; current other -> 0.7; non-current -> null
- competitionCloseability = caller override or null

Build `factVsInference` deterministically:

```ts
const sourceFacts = candidate.signal.facts.map((fact) => ({
  kind: 'FACT',
  statement: fact.statement,
  evidenceRefs: [...fact.evidenceRefs],
}));

const modeledInferences = [
  {kind: 'INFERENCE', statement: `commercial-priority:${priorityResult.priority}`, evidenceRefs: [...candidate.signal.provenanceRefs]},
  ...(winProbability.probability === null ? [] : [{
    kind: 'INFERENCE',
    statement: `uncalibrated-win-probability:${winProbability.probability}`,
    evidenceRefs: [...winProbability.evidenceRefs],
  }]),
] as const;
```

Generate deterministic task IDs from `candidate.signal.id`, for example:

```ts
const taskId = (kind: InvestigationTask['kind']) => `investigation:${candidate.signal.id}:${kind.toLowerCase()}`;
```

Generate tasks:

- non-current -> `REVALIDATE_SOURCE`
- `EVIDENCE_GAP` -> `PROVE_CAPABILITY`
- eligibility `UNKNOWN`/`PARTIAL` -> `VERIFY_ELIGIBILITY`
- ambiguous amount semantics when P0/P0-Critical depends on them -> `RESOLVE_VALUE_SEMANTICS`
- every P0/P0-Critical -> `FALSIFY_OPPORTUNITY`

For each generated task, set `required` to `!input.resolvedInvestigationTaskIds.includes(task.id)`. Resolved tasks must retain evidence references; if the caller marks a task resolved without evidence available in the packet inputs, keep it required and add `RESOLUTION_EVIDENCE_MISSING` to `missingEvidence`.

`READY_FOR_HUMAN_REVIEW` only when:

```ts
revalidation.state === 'CURRENT'
&& priority !== 'REJECT'
&& !candidate.credibility.reject
&& buildGraphMatch.state !== 'EVIDENCE_GAP'
&& eligibility.state !== 'DISQUALIFIED'
&& proofTasks.every((task) => !task.required)
```

- [ ] **Step 4: Add authority-source guard test**

`commercial-intelligence-authority.test.mjs` reads the new core source files and rejects source-write signatures:

```js
const forbidden = [
  /method:\s*['"]POST['"]/i,
  /method:\s*['"]PUT['"]/i,
  /method:\s*['"]PATCH['"]/i,
  /method:\s*['"]DELETE['"]/i,
  /send(message|email)/i,
  /submit(bid|proposal|application)/i,
  /accept(contract|project)/i,
  /release(milestone|payment)/i,
  /\bfetch\s*\(/,
];
```

- [ ] **Step 5: Run targeted/full verification**

```bash
npm run build:core
node --experimental-strip-types --test packages/core/test/critical-investigation.test.mjs packages/core/test/commercial-intelligence-authority.test.mjs
npm test
npm run typecheck
npm run smoke
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Export and commit**

Add `export * from './critical-investigation.ts';` and ensure all Task 1-7 exports are present in `packages/core/src/index.ts`.

Commit message:

```text
feat: assemble critical commercial investigation packets
```

---

### Task 9: Documentation, Diff Audit, Exact-Head Acceptance, and Stacked PR

**Files:**
- Modify: `README.md`
- Optionally create: `docs/commercial-intelligence-engine.md` only if README would become unwieldy; otherwise keep one authoritative design spec plus README summary.

**Interfaces:**
- No runtime interface changes beyond Tasks 1-8.

- [ ] **Step 1: Update README truthfully**

Document:

- Commercial Intelligence Engine is deterministic/read-only.
- `$1M` P0-Critical rules.
- difference among economic exposure, contract value, win probability, and expected pursuit value.
- BuildGraph proof requirement.
- 6h/24h/72h/7d revalidation windows.
- `READY_FOR_HUMAN_REVIEW` does not authorize outreach.
- win probability is uncalibrated v1.

Do not claim live BuildGraph commercial matching has succeeded unless a real runtime invocation was actually executed and evidenced.

- [ ] **Step 2: Run final verification on the exact branch head**

Required CI-equivalent gates:

```bash
npm test
pytest -q connectors/freelancer/tests
python -m py_compile connectors/freelancer/freelancer_mcp_server.py
pytest -q connectors/fiverr/tests
python -m py_compile connectors/fiverr/fiverr_mcp_server.py
npm run typecheck
npm run smoke
npm run build
```

- [ ] **Step 3: Audit branch diff against PR #19 head**

Expected scope only:

```text
README.md
docs/superpowers/specs/2026-08-16-commercial-intelligence-engine-v1-design.md
docs/superpowers/plans/2026-08-16-commercial-intelligence-engine-v1.md
packages/core/src/{economic-pain,commercial-buildgraph,commercial-eligibility,commercial-value,commercial-winability,commercial-priority,opportunity-revalidation,critical-investigation}.ts
packages/core/src/index.ts
packages/core/test/{economic-pain,commercial-buildgraph,commercial-eligibility,commercial-value,commercial-winability,commercial-priority,opportunity-revalidation,critical-investigation,commercial-intelligence-authority}.test.mjs
```

No deployment, DNS, collector, marketplace-write, or app UI files should change.

- [ ] **Step 4: Verify `main` was not moved**

Fetch `refs/heads/main` and compare to the known pre-tranche value. Do not update it.

- [ ] **Step 5: Create/update a new draft PR stacked on PR #19**

Base branch:

```text
codex/public-demand-collectors-v1
```

Head branch:

```text
codex/commercial-intelligence-engine-v1
```

Suggested title:

```text
Add commercial intelligence and P0 critical investigation engine
```

PR body must explicitly state:

- stacked on PR #19
- read-only/deterministic
- no external outreach authority
- exact P0/P0-Critical thresholds
- seven-figure budget and recoverable-loss acceptance tests
- uncalibrated win probability
- exact-head CI run ID and head SHA
- open/draft/unmerged status

- [ ] **Step 6: Final review evidence**

Record exact head SHA, CI job conclusion, changed-file count, and `main` SHA. Only then claim the tranche is complete.
