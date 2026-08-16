# Commercial Intelligence Engine v1

The Commercial Intelligence Engine is the deterministic, read-only layer between verified demand discovery and any future externally authorized pursuit workflow.

It converts a `PublicDemandCandidate` plus caller-supplied verified evidence into a `CriticalInvestigationPacket`. The packet can become `READY_FOR_HUMAN_REVIEW`, but it never authorizes outreach, bidding, proposal submission, contract acceptance, purchases, payments, deployment, or any other external side effect.

## Pipeline

```text
Verified Demand Candidate
  -> Structured Economic Pain
  -> Verified BuildGraph Cross-Match
  -> Eligibility Assessment
  -> Commercial Value Model
  -> P0 / P0-Critical Policy
  -> Opportunity Revalidation
  -> Uncalibrated Winability Model
  -> Pursuit Economics
  -> Critical Investigation Packet
  -> READY_FOR_HUMAN_REVIEW / NOT_READY
  -> STOP BEFORE EXTERNAL ACTION
```

All commercial-intelligence modules live in `packages/core` and contain no provider network calls. A static authority test rejects `fetch()` usage and common external-write signatures in these modules.

## Economic facts and value semantics

The engine keeps four concepts separate:

1. **Observed budget / contract evidence** — money explicitly described by verified source facts as procurement budget, fixed contract value, or budget range.
2. **Observed economic exposure** — money described as recoverable loss, revenue exposure, labor cost, savings, or another economic impact.
3. **Estimated contract value** — a pricing estimate permitted only when procurement/contract evidence supports it.
4. **Expected pursuit value** — estimated contract value multiplied by modeled win probability, minus pursuit cost when all required inputs are known.

Unknown values stay `null`. They are never silently converted to zero.

### Supported observed amount kinds

```text
EXPLICIT_BUDGET
FIXED_CONTRACT_VALUE
BUDGET_RANGE
RECOVERABLE_LOSS
REVENUE_EXPOSURE
LABOR_COST
COST_SAVINGS
OTHER_EXPOSURE
```

The source statement and evidence references are preserved with every observed amount.

### Contract-value precedence

1. Verified fixed contract amount -> exact min/expected/max.
2. Verified budget range -> preserve min/max; expected value may use the mathematical midpoint and records that assumption explicitly.
3. Single verified budget amount -> treated as a ceiling; expected contract value remains unknown.
4. Economic exposure without procurement-pricing evidence -> contract value remains unknown.

A recoverable `$1.4M` loss does **not** become a `$1.4M` software contract.

## P0 and P0-Critical policy

Commercial priority is evaluated only after hard validity gates:

- demand must be `VERIFIED`
- credibility/scam screening must not hard-reject
- eligibility must not be `DISQUALIFIED`

### P0-Critical

- `P0_CRITICAL / BUDGET` — verified USD explicit budget, fixed contract value, or budget range with a maximum of at least **$1,000,000**.
- `P0_CRITICAL / RECOVERABLE_LOSS` — verified explicitly recoverable USD loss/exposure of at least **$1,000,000**.

P0-Critical means **mandatory investigation**. It does not mean automatic pursuit.

A weak capability match does not suppress an otherwise valid P0-Critical signal. Instead, the packet remains critical and requires capability proof before human-review readiness.

### Ordinary P0

A non-critical signal can become `P0` when either:

- upstream public-demand ranking is `PRIORITY_0`, or
- verified explicit budget is at least **$100,000**, buyer-intent score is at least **0.70**, and credibility score is at least **0.70**.

Ambiguous seven-figure `OTHER_EXPOSURE` is not automatically promoted into recoverable-loss criticality.

Every commercial-priority result contains:

```ts
externalActionAllowed: false
```

## Verified BuildGraph commercial matching

The commercial cross-match consumes the existing `BuildGraphPreflightResult` plus verified project/capability/artifact evidence supplied by the caller. It does not invent a new BuildGraph endpoint.

Only BuildGraph evidence items satisfying all of these conditions can contribute to proof:

- `verified: true`
- non-empty stable ID
- non-empty evidence references
- deterministic textual overlap with the demand scope

Possible states:

```text
VERIFIED_MATCH
PARTIAL_MATCH
EVIDENCE_GAP
```

An ID appearing in preflight metadata without an evidence-backed item cannot manufacture a verified commercial capability match.

## Eligibility

Eligibility checks are evidence-driven and may cover:

- buyer/source legitimacy
- geography
- qualifications/certifications
- deadline viability
- capability proof

States:

```text
ELIGIBLE
PARTIAL
UNKNOWN
DISQUALIFIED
```

`PASS` and `FAIL` checks require evidence references. Missing facts remain `UNKNOWN`. A hard evidence-backed failure produces `DISQUALIFIED`.

## Win probability

The v1 winability model is explicitly:

```text
UNCALIBRATED_V1
```

It is a deterministic model estimate, not a statistically calibrated forecast.

Weights:

| Factor | Weight |
|---|---:|
| Verified capability evidence | 25% |
| Eligibility | 20% |
| Buyer intent | 15% |
| Credibility | 10% |
| Scope fit | 10% |
| Reuse efficiency | 10% |
| Freshness / urgency | 5% |
| Competition / closeability | 5% |

Unknown inputs are omitted from the weighted numerator and denominator. They lower model-input confidence instead of being treated as zero. Hard disqualifiers force modeled win probability to zero.

## Opportunity aging and revalidation

Revalidation is separate from commercial priority. A stale seven-figure opportunity may remain `P0_CRITICAL` while being blocked from `READY_FOR_HUMAN_REVIEW` until refreshed.

Default windows:

| Priority | Revalidation window |
|---|---:|
| P0_CRITICAL | 6 hours |
| P0 | 24 hours |
| STRONG | 72 hours |
| MONITOR | 7 days |
| REJECT | none |

States:

```text
CURRENT
REVALIDATION_DUE
STALE
INVALIDATED
```

A `lastRevalidatedAt` timestamp can reset freshness only when accompanied by revalidation evidence references. Content-fingerprint changes become `STALE`; an evidence-backed inactive/closed source becomes `INVALIDATED`.

## Critical Investigation Packet

The final packet contains:

- source evidence references
- fact-vs-inference ledger
- structured economic pain
- BuildGraph commercial match
- commercial-value report
- eligibility assessment
- uncalibrated win-probability estimate
- pursuit economics
- revalidation assessment
- falsification questions
- deterministic proof tasks
- missing-evidence list
- human-review readiness
- `externalActionAllowed: false`

### Proof-task kinds

```text
REVALIDATE_SOURCE
PROVE_CAPABILITY
VERIFY_ELIGIBILITY
RESOLVE_VALUE_SEMANTICS
FALSIFY_OPPORTUNITY
```

Task IDs are deterministic:

```text
investigation:<demand-signal-id>:<task-kind-lowercase>
```

### Evidence-backed task resolution

The implemented v1 interface uses resolution objects, not bare task IDs:

```ts
interface InvestigationTaskResolution {
  id: string;
  evidenceRefs: string[];
}
```

A task is resolved only when its matching resolution carries at least one non-empty evidence reference. Supplying a bare ID or an empty evidence list leaves the task required and adds:

```text
RESOLUTION_EVIDENCE_MISSING:<task-id>
```

to the packet's missing-evidence list.

This evidence-backed resolution object is the authoritative runtime contract and supersedes any provisional bare-ID wording in early design/planning notes.

## Human-review readiness

A packet can become `READY_FOR_HUMAN_REVIEW` only when all of these conditions hold:

- revalidation state is `CURRENT`
- priority is not `REJECT`
- credibility screen has not rejected the signal
- BuildGraph state is not `EVIDENCE_GAP`
- eligibility is not `DISQUALIFIED`
- every deterministic proof task has been resolved with evidence

Even then:

```text
externalActionAllowed = false
```

Human-review readiness is therefore an investigation-completion state, not an outreach authorization.

## Canonical seven-figure acceptance cases

### Verified `$1.4M` software procurement budget

Expected behavior:

```text
P0_CRITICAL / BUDGET
contract maximum = $1.4M
expected contract value = unknown unless fixed-contract/range evidence supports it
revalidation required every 6 hours
capability/eligibility/falsification gates applied
external action = false
```

### Verified `$1.4M` explicitly recoverable billing loss

Expected behavior:

```text
P0_CRITICAL / RECOVERABLE_LOSS
observed economic exposure = $1.4M
expected contract value = unknown
expected gross pursuit value = unknown
expected net pursuit value = unknown
value-semantics/recoverability investigation required
external action = false
```

## Authority boundary

The Commercial Intelligence Engine does not contain or authorize:

- provider POST/PUT/PATCH/DELETE calls
- emails or client messages
- bids, proposals, or applications
- contract/project acceptance
- milestone or payment release
- purchases
- deployment
- DNS changes
- credential persistence

Future external pursuit must remain behind OpportunityOS's existing Trust Kernel and payload-bound approval boundary.
