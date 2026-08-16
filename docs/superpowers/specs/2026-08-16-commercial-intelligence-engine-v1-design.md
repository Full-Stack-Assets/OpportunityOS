# Commercial Intelligence Engine v1 — Design

**Status:** Approved product direction, implementation-ready design  
**Date:** 2026-08-16  
**Branch:** `codex/commercial-intelligence-engine-v1`  
**Stack base:** `codex/public-demand-collectors-v1` / PR #19  
**Scope:** Read-only commercial analysis through approval-ready investigation packaging. No outreach or consequential external action.

## 1. Purpose

Convert verified OpportunityOS demand signals into evidence-bound commercial intelligence that answers five questions without inventing missing facts:

1. What economically important problem is actually observed?
2. What verified existing capabilities, projects, or artifacts can satisfy it?
3. What is the defensible commercial value of the opportunity?
4. Is it important enough to require immediate investigation?
5. What must be proven before a human could reasonably authorize pursuit?

The target pipeline is:

```text
Verified Demand Candidate
  -> Economic Pain Extraction
  -> Verified BuildGraph Cross-Match
  -> Commercial Value Model
  -> Priority / P0-Critical Classification
  -> Eligibility + Winability Analysis
  -> Pursuit Economics
  -> Opportunity Aging / Revalidation
  -> Critical Investigation Packet
  -> STOP BEFORE EXTERNAL OUTREACH
```

A verified seven-figure opportunity is **mandatory to investigate**, not automatically safe to pursue.

## 2. Non-Negotiable Invariants

1. **Evidence before commercial claims.** Facts require evidence references. Inferences must be labeled as inferences.
2. **Unknown is not zero.** Missing budget, contract value, win probability inputs, eligibility details, or pursuit costs remain unknown.
3. **Economic exposure is not contract value.** A buyer losing $1.4M does not imply a $1.4M software contract.
4. **Contract value is not expected pursuit value.** Expected pursuit value additionally depends on win probability and pursuit cost.
5. **P0-Critical does not bypass disqualifiers.** Invalid source evidence, hard scam triggers, legal/eligibility disqualification, or stale/unverified demand can block pursuit even when the amount is enormous.
6. **P0-Critical is an investigation lane.** It requires accelerated proof gathering, not automatic messaging, bidding, signing, purchasing, deployment, or payment.
7. **BuildGraph evidence must be verified.** No capability, project, artifact, or reuse claim may be created from an identifier that cannot be tied to BuildGraph evidence.
8. **No new BuildGraph endpoint is invented.** v1 consumes the existing `BuildGraphPreflightResult` plus caller-supplied verified BuildGraph evidence bundles when available.
9. **No external write methods.** The Commercial Intelligence Engine is deterministic core logic plus read-only adapters.
10. **Aging is explicit.** High-value opportunities become stale faster, not slower, because the cost of acting on obsolete information is higher.

## 3. Architecture

### 3.1 New focused core modules

Add the following under `packages/core/src/`:

- `economic-pain.ts`
- `commercial-value.ts`
- `commercial-priority.ts`
- `commercial-buildgraph.ts`
- `commercial-winability.ts`
- `opportunity-revalidation.ts`
- `critical-investigation.ts`

Do not expand `public-demand.ts` into a monolith. Existing buyer-intent, credibility, basic economic-pain classification, public-demand ranking, and portfolio matching remain upstream inputs.

### 3.2 Orchestration boundary

Expose one deterministic assembly function:

```ts
buildCommercialInvestigation(input): CommercialInvestigationResult
```

It accepts already-retrieved evidence and a caller-supplied `now` timestamp. It performs no network I/O.

A separate read-only adapter may call the existing BuildGraph preflight client before invoking the deterministic assembler. Network behavior must not leak into core scoring or classification.

## 4. Economic Pain Extractor

### 4.1 Goal

Upgrade the current categorical `classifyEconomicPain()` output into structured, evidence-bound economic observations.

### 4.2 Types

```ts
type EconomicAmountKind =
  | 'EXPLICIT_BUDGET'
  | 'FIXED_CONTRACT_VALUE'
  | 'BUDGET_RANGE'
  | 'RECOVERABLE_LOSS'
  | 'REVENUE_EXPOSURE'
  | 'LABOR_COST'
  | 'COST_SAVINGS'
  | 'OTHER_EXPOSURE';

interface ObservedEconomicAmount {
  kind: EconomicAmountKind;
  minCents: number | null;
  maxCents: number | null;
  currency: string;
  statement: string;
  evidenceRefs: string[];
  confidence: number;
  observedOnly: true;
}
```

### 4.3 Rules

- Parse monetary values only from verified source facts.
- Preserve the exact source statement that produced the amount.
- Recognize `k` and `m` suffixes and comma-separated values.
- Distinguish ranges from single amounts.
- Use nearby semantic context to classify the amount kind.
- If amount semantics are ambiguous, use `OTHER_EXPOSURE` instead of guessing.
- Never convert recoverable loss or revenue exposure into contract value automatically.

## 5. Verified BuildGraph Commercial Cross-Match

### 5.1 Goal

Determine whether the opportunity has reusable, demonstrable capability evidence.

### 5.2 Inputs

```ts
interface BuildGraphCommercialEvidence {
  preflight: BuildGraphPreflightResult;
  projects: VerifiedBuildGraphProjectEvidence[];
  capabilities: VerifiedBuildGraphCapabilityEvidence[];
  artifacts: VerifiedBuildGraphArtifactEvidence[];
}
```

Each evidence object requires an ID, title/description, evidence references, and `verified: true` before it can affect scoring.

### 5.3 Output

```ts
interface CommercialCapabilityMatch {
  state: 'VERIFIED_MATCH' | 'PARTIAL_MATCH' | 'EVIDENCE_GAP';
  score: number | null;
  projectIds: string[];
  capabilityIds: string[];
  artifactIds: string[];
  evidenceRefs: string[];
  reuseDecision: BuildGraphDecision | null;
  proofPlan: string[];
}
```

### 5.4 Rules

- Existing BuildGraph preflight evidence IDs may support a match but never substitute for missing project/artifact proof.
- `CREATE_NEW` is not a negative commercial signal by itself.
- `REUSE_EXISTING`, `EXTEND_EXISTING`, or `FORK_EXISTING` can increase reuse efficiency only when supporting evidence is present.
- Empty/unknown BuildGraph `candidates` cannot be interpreted as verified capability evidence.
- A P0-Critical opportunity with `EVIDENCE_GAP` stays P0-Critical but receives a mandatory capability-proof step.

## 6. Commercial Value Model

### 6.1 Separate value concepts

Return four distinct values:

1. **Observed budget / contract evidence**
2. **Observed economic exposure**
3. **Estimated contract value**
4. **Expected pursuit value**

### 6.2 Contract value

```ts
interface ContractValueEstimate {
  minCents: number | null;
  expectedCents: number | null;
  maxCents: number | null;
  currency: string | null;
  confidence: number;
  basis: 'FIXED_CONTRACT' | 'BUDGET_RANGE' | 'BUDGET_CEILING' | 'INSUFFICIENT_EVIDENCE';
  evidenceRefs: string[];
  assumptions: string[];
}
```

Rules:

- Explicit fixed contract amount: `min = expected = max = amount`.
- Explicit budget range: preserve min/max; expected may use the mathematical midpoint and must record that assumption.
- Single explicit budget ceiling: max may be known; expected remains `null` unless fixed-value language is present.
- Economic loss/exposure without procurement pricing: contract value remains `null`.
- Never estimate a contract price by multiplying economic exposure by an arbitrary capture percentage.

### 6.3 Pursuit economics

```ts
interface PursuitEconomics {
  expectedContractValueCents: number | null;
  modeledWinProbability: number | null;
  expectedGrossPursuitValueCents: number | null;
  estimatedPursuitCostCents: number | null;
  expectedNetPursuitValueCents: number | null;
  currency: string | null;
}
```

`expectedGrossPursuitValue = expectedContractValue * winProbability` only when both inputs are known.

`expectedNetPursuitValue = expectedGrossPursuitValue - estimatedPursuitCost` only when both are known.

## 7. Win Probability / Winability Model

### 7.1 Truthful naming

Expose a model-estimated win probability, but mark it explicitly as **uncalibrated v1** until Outcome Analysis has enough historical wins/losses to calibrate it.

```ts
interface WinProbabilityEstimate {
  probability: number | null;
  confidence: number;
  calibrationState: 'UNCALIBRATED_V1';
  knownInputs: string[];
  unknownInputs: string[];
  evidenceRefs: string[];
  reasons: string[];
}
```

### 7.2 Factors

Known factors use normalized 0..1 values:

- verified capability evidence: 25%
- eligibility / lack of disqualifiers: 20%
- buyer intent: 15%
- source credibility: 10%
- scope fit: 10%
- reuse efficiency: 10%
- freshness / urgency: 5%
- competition / closeability evidence: 5%

Unknown values are excluded from the weighted numerator and denominator; they reduce confidence instead of being silently scored as zero.

Hard disqualifiers can set probability to zero with explicit evidence.

## 8. Priority Engine

### 8.1 Priority classes

```ts
type CommercialPriority =
  | 'P0_CRITICAL'
  | 'P0'
  | 'STRONG'
  | 'MONITOR'
  | 'REJECT';

type CriticalReason = 'BUDGET' | 'RECOVERABLE_LOSS';
```

### 8.2 Hard validity gate

Before any P0-Critical rule is evaluated:

- demand must be `VERIFIED`
- demand must not already be invalidated
- credibility screen must not hard-reject
- no known hard legal/eligibility disqualifier may make pursuit impossible

Failure of the hard validity gate returns `REJECT` or `REVALIDATION_REQUIRED` rather than P0-Critical.

### 8.3 P0-Critical rules

After hard validity:

- verified explicit budget / fixed contract / budget ceiling >= **$1,000,000 USD** -> `P0_CRITICAL / BUDGET`
- verified recoverable loss or economic exposure >= **$1,000,000 USD** with explicit recoverability evidence -> `P0_CRITICAL / RECOVERABLE_LOSS`

P0-Critical is mandatory investigation even when capability fit is weak. Capability gaps change the investigation requirements, not the criticality class.

### 8.4 P0 rules

A non-critical opportunity may become `P0` when:

- upstream public-demand ranking is `PRIORITY_0`, or
- verified explicit budget >= $100,000 with credible buyer intent, or
- expected net pursuit value is known and materially high under policy thresholds.

v1 should prefer existing upstream `PRIORITY_0` behavior over introducing many new overlapping thresholds.

### 8.5 Criticality never authorizes action

Every priority result contains:

```ts
externalActionAllowed: false
```

and cannot create a Trust Kernel external-action approval by itself.

## 9. Eligibility Analysis

```ts
interface EligibilityAssessment {
  state: 'ELIGIBLE' | 'PARTIAL' | 'UNKNOWN' | 'DISQUALIFIED';
  checks: EligibilityCheck[];
  hardDisqualifiers: string[];
  missingEvidence: string[];
  evidenceRefs: string[];
}
```

Initial checks are evidence-driven and generic:

- source/buyer legitimacy
- explicit eligibility requirements found in source evidence
- geography/jurisdiction constraints when stated
- required qualifications/certifications when stated
- deadline viability when stated
- capability proof availability

Absence of a stated requirement is `UNKNOWN`, not automatically eligible.

## 10. Opportunity Aging and Revalidation

### 10.1 Status

```ts
type RevalidationState =
  | 'CURRENT'
  | 'REVALIDATION_DUE'
  | 'STALE'
  | 'INVALIDATED';
```

### 10.2 Default revalidation windows

- `P0_CRITICAL`: 6 hours
- `P0`: 24 hours
- `STRONG`: 72 hours
- `MONITOR`: 7 days
- `REJECT`: no scheduled revalidation unless explicitly reopened

### 10.3 Rules

- Caller supplies `now`; core never reads wall-clock time implicitly.
- Content fingerprint change requires full re-analysis.
- Source deletion/closure/cancellation may invalidate the opportunity.
- A stale P0/P0-Critical opportunity cannot become `APPROVAL_READY` until revalidated.
- Revalidation must add evidence; merely updating a timestamp is insufficient.

## 11. Critical Investigation Packet

```ts
interface CriticalInvestigationPacket {
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
```

### 11.1 Packet goals

For a verified `$1.4M` software procurement signal, the packet should answer:

- Is `$1.4M` an explicit budget, fixed contract amount, or merely economic exposure?
- Is the buyer/source legitimate?
- Is the opportunity still active?
- What BuildGraph projects/capabilities/artifacts directly prove delivery ability?
- What requirements remain unproven?
- Are there eligibility blockers?
- What is the uncalibrated modeled win probability and confidence?
- What is contract value versus expected pursuit value?
- Which facts would falsify the opportunity quickly?
- What investigation work is required before external pursuit could be proposed?

### 11.2 Approval readiness

`READY_FOR_HUMAN_REVIEW` requires:

- current/revalidated source evidence
- no hard disqualifier
- source credibility above policy floor
- no unresolved contradiction in budget/value semantics
- capability state not `EVIDENCE_GAP`
- eligibility not `DISQUALIFIED`
- falsification questions completed or explicitly accepted as residual risk

It still does **not** authorize outreach.

## 12. Data Flow

```text
Attributed Collector Observation
      |
      v
PublicDemandCandidate
      |
      +--> structured economic amounts
      +--> BuildGraph preflight/evidence bundle
      +--> eligibility evidence
      |
      v
Commercial Intelligence Assembly
      |
      +--> Commercial Value
      +--> Win Probability
      +--> Pursuit Economics
      +--> Priority / Critical Reason
      +--> Revalidation State
      |
      v
Critical Investigation Packet
      |
      +--> READY_FOR_HUMAN_REVIEW
      +--> NOT_READY + proof/falsification tasks
      |
      X  STOP: no external outreach
```

## 13. Error Handling / Fail-Closed Behavior

- malformed or negative amounts -> reject the amount, not fabricate a replacement
- unsupported currency -> preserve amount statement but do not compare against USD critical threshold unless an evidence-backed conversion is provided by a later adapter
- missing BuildGraph proof -> `EVIDENCE_GAP`
- missing eligibility facts -> `UNKNOWN`
- missing winability inputs -> lower confidence; do not force zero
- missing contract value -> pursuit expected value remains `null`
- stale P0/P0-Critical -> `REVALIDATION_DUE`/`STALE`, no approval readiness
- hard credibility/eligibility disqualifier -> `REJECT`
- contradictions between verified facts -> packet `NOT_READY` and list contradictions

## 14. TDD / Acceptance Tests

Required RED-first test families:

### Economic pain

1. `$1.4M budget` becomes `EXPLICIT_BUDGET` with exact evidence.
2. `$1.4M recoverable loss` becomes `RECOVERABLE_LOSS`, not contract value.
3. Ambiguous `$1.4M impact` becomes `OTHER_EXPOSURE`.
4. Ranges preserve min/max.

### BuildGraph cross-match

5. Verified project/capability/artifact evidence produces `VERIFIED_MATCH`.
6. IDs without proof cannot create a verified match.
7. Weak BuildGraph fit does not suppress an otherwise valid P0-Critical signal.

### Commercial value

8. Fixed contract amount may become expected contract value.
9. Budget ceiling does not become expected contract value.
10. Economic exposure never becomes contract price automatically.
11. Unknown values remain `null`, not zero.

### Priority

12. Verified `$1.4M` explicit budget -> `P0_CRITICAL / BUDGET`.
13. Verified `$1.4M` recoverable loss -> `P0_CRITICAL / RECOVERABLE_LOSS`.
14. Hard scam reject overrides seven-figure amount.
15. Unverified seven-figure text cannot become P0-Critical.

### Winability / economics

16. Unknown factors lower confidence rather than score as zero.
17. Hard eligibility disqualifier produces zero win probability.
18. Pursuit EV remains null when expected contract value is unknown.

### Revalidation

19. P0-Critical is due after 6 hours.
20. Content fingerprint change requires full re-analysis.
21. Stale P0-Critical cannot be approval-ready.

### Packet / authority

22. Critical packet preserves all fact/inference evidence.
23. Missing capability proof produces explicit proof tasks.
24. `externalActionAllowed` is always `false`.
25. Commercial-intelligence source contains no external provider write methods.

## 15. Explicitly Out of Scope

- sending emails/messages/proposals/applications
- creating marketplace bids
- accepting contracts
- signing documents
- making payments or purchases
- autonomous production deployment
- inventing BuildGraph endpoints
- live currency conversion inside deterministic core
- calibrated win probabilities before sufficient outcome history exists
- Reddit/GitHub Discussions source expansion

## 16. Definition of Done

The tranche is complete when:

1. All design modules exist with focused boundaries.
2. RED-first tests prove each production slice was absent before implementation.
3. A verified `$1.4M` explicit software-procurement budget deterministically yields `P0_CRITICAL / BUDGET`.
4. A verified `$1.4M` recoverable-loss signal deterministically yields `P0_CRITICAL / RECOVERABLE_LOSS` while contract value remains unknown.
5. BuildGraph evidence affects capability/reuse only when verified.
6. Unknowns remain unknown throughout the pipeline.
7. Revalidation blocks stale critical opportunities from becoming review-ready.
8. The packet can become `READY_FOR_HUMAN_REVIEW` but never authorizes outreach.
9. Existing PR #19 collector behavior remains green.
10. Exact-head CI passes behavioral tests, existing connector tests, strict TypeScript, smoke verification, and full build.
11. The new PR remains stacked, draft, open, and unmerged.
