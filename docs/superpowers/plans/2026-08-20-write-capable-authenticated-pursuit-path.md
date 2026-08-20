# Write-Capable Authenticated Pursuit Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe, authenticated write path that can submit verified applications/bids through official APIs first and browser-assisted execution second, without weakening OpportunityOS authorization, evidence, simulation, or receipt guarantees.

**Architecture:** Keep discovery/source connectors read-only. Compile every pursuit into a canonical evidence-aware `PreparedApplication`, bind authorization to its canonical hash, route through a scoped executor, independently verify the external result, and persist a chained receipt. Implement the first official API write through Freelancer's documented bid API and the first browser family through a generic ATS Playwright executor, while preserving `SIMULATION` and adding `LIVE_INSPECT` before any canary write.

**Tech Stack:** Node.js >=22.13, TypeScript 6, existing `@opportunityos/core` Trust Kernel, PostgreSQL, Python 3 + `requests`/MCP for Freelancer, Playwright for browser execution, Node `crypto` AES-256-GCM for encrypted credential/session blobs.

**Spec:** `docs/superpowers/specs/2026-08-20-write-capable-authenticated-pursuit-path-design.md`

## Global Constraints

- Preserve `SOURCE -> FACT -> POLICY -> APPROVAL -> ACTION -> VERIFICATION -> RECEIPT`.
- Existing source connectors remain read-oriented; writes live behind a separate pursuit-execution boundary.
- Execution modes are exactly `SIMULATION`, `LIVE_INSPECT`, and `LIVE_AUTHORIZED`.
- No CAPTCHA solving, MFA bypass, stealth/fingerprint evasion, automated account recovery, or undocumented private API use.
- Authentication proves identity, not authority; every write still requires payload-bound authorization.
- No raw tokens, cookies, passwords, MFA material, or protected demographic answers in Git, model-visible payloads, logs, or receipts.
- Costs use integer minor units; no floating-point money.
- A write executor cannot self-verify. `SUBMITTED_VERIFIED` requires independent durable evidence.
- `EXECUTED_UNVERIFIED` never auto-retries; it enters reconciliation first.
- New monetary purchases, Connects/bid-token purchases, contract acceptance, payout actions, and account-security changes remain denied by default.
- Outbound pursuit email remains disabled unless `From: nicholas@fullstackassets.com` can be verified by the sending provider.
- Existing simulation tests and `externalSideEffects: 0` semantics must remain unchanged.

---

## File Structure

### Core contracts and policy
- Create `packages/core/src/pursuit.ts` — canonical application, live-form, execution, verification, and status contracts.
- Create `packages/core/src/pursuit-policy.ts` — evidence/attestation gates, cost checks, live-form diffing, and submission eligibility.
- Create `packages/core/src/pursuit-gateway.ts` — payload-bound authorization, execution-mode enforcement, idempotency/reconciliation decisions, receipt construction.
- Modify `packages/core/src/index.ts` — export the new contracts.
- Create `packages/core/test/pursuit.test.mjs`, `pursuit-policy.test.mjs`, `pursuit-gateway.test.mjs`.

### Durable pursuit state
- Create `database/migrations/002_pursuit_execution.sql` — prepared applications, attempts, verification evidence, idempotency keys, encrypted secret metadata references.
- Create `packages/postgres/src/pursuit-store.ts` — persistence interface for prepared applications, attempts, reconciliation, and receipts.
- Modify `packages/postgres/src/index.ts`.
- Create `packages/postgres/test/pursuit-store.test.mjs`.

### Authenticated execution package
- Create `packages/pursuit-execution/package.json`, `tsconfig.json`, `src/index.ts`.
- Create `packages/pursuit-execution/src/encrypted-store.ts` — AES-256-GCM envelope storage for credential/session blobs.
- Create `packages/pursuit-execution/src/credential-broker.ts` — opaque API credential references and scopes.
- Create `packages/pursuit-execution/src/session-broker.ts` — opaque browser-session references and account verification metadata.
- Create `packages/pursuit-execution/src/router.ts` — API-first executor selection.
- Create `packages/pursuit-execution/src/verifier.ts` — independent verifier registry.
- Create `packages/pursuit-execution/test/*.test.mjs`.

### Browser executor
- Create `packages/pursuit-execution/src/browser/field-classifier.ts`.
- Create `packages/pursuit-execution/src/browser/challenge-detector.ts`.
- Create `packages/pursuit-execution/src/browser/ats-executor.ts`.
- Create `packages/pursuit-execution/src/browser/providers/{generic,ashby,lever,greenhouse}.ts`.
- Create `packages/pursuit-execution/test/fixtures/*.html` for normal, changed-field, CAPTCHA, MFA, account-mismatch, cost-change, and confirmation flows.

### Freelancer official API executor
- Keep `connectors/freelancer/freelancer_mcp_server.py` read-only.
- Create `connectors/freelancer/freelancer_pursuit_server.py` — authenticated bid inspect/submit/verify tools only.
- Create `connectors/freelancer/tests/test_freelancer_pursuit_server.py`.
- Modify `connectors/freelancer/README.md` and `requirements.txt` only if a new dependency is actually required; prefer existing `requests`.

### Runtime and operator surfaces
- Modify `apps/worker/src/main.ts` — add pursuit job dispatch without changing simulation behavior.
- Create `apps/control-plane/app/api/pursuits/inspect/route.ts` and `apps/control-plane/app/api/pursuits/status/route.ts` — inspection/status only; no browser-side secret exposure.
- Create `scripts/pursuit-canary.ts` — Gate A/B/C canary harness with explicit mode and approval requirements.
- Modify `.env.example`, root `package.json`, and relevant workspace package files.

---

### Task 1: Canonical pursuit contracts and application compiler

**Files:**
- Create: `packages/core/src/pursuit.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/pursuit.test.mjs`

**Interfaces:**
- Produces: `ExecutionMode`, `EvidenceClass`, `AttestationClass`, `PreparedAnswer`, `PreparedApplication`, `FormField`, `FormSchema`, `PursuitTarget`, `AuthorizedPursuitAction`, `ExecutionResult`, `VerificationResult`, `PursuitExecutionStatus`, `compilePreparedApplication()`.
- Consumes: `hashCanonical()` from `packages/core/src/canonical.ts`.

- [ ] **Step 1: Write the failing compiler tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePreparedApplication } from '../dist/pursuit.js';

test('compiler hashes the exact canonical application payload', () => {
  const app = compilePreparedApplication({
    opportunityId: 'opp-1', pursuitId: 'p-1', targetPlatform: 'freelancer',
    targetUrl: 'https://www.freelancer.com/projects/123', applicantIdentityRef: 'applicant:nicholas',
    answers: [{ fieldKey: 'degree', prompt: 'Degree?', answer: 'Current undergraduate', sourceOfTruthRef: 'canon:education', confidence: 'HIGH', evidenceClass: 'VERIFIED_FACT', attestationClass: 'ORDINARY' }],
    portfolioRefs: ['github:Full-Stack-Assets/OpportunityOS'],
    expectedCost: { amountMinor: 0, currency: 'USD', credits: 0, requiresPurchase: false },
    requiredUploads: [], preparedAt: '2026-08-20T05:00:00Z', expiresAt: '2026-08-20T06:00:00Z',
  });
  assert.match(app.payloadHash, /^[a-f0-9]{64}$/);
});

test('compiler rejects floating point money', () => {
  assert.throws(() => compilePreparedApplication({ /* valid fixture */ expectedCost: { amountMinor: 12.5, currency: 'USD', requiresPurchase: false } }), /amountMinor/);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm run build:core && node --test packages/core/test/pursuit.test.mjs`
Expected: FAIL because `../dist/pursuit.js` does not exist.

- [ ] **Step 3: Implement the contracts and compiler**

```ts
export type ExecutionMode = 'SIMULATION' | 'LIVE_INSPECT' | 'LIVE_AUTHORIZED';
export type EvidenceClass = 'VERIFIED_FACT' | 'USER_ATTESTED_FACT' | 'DERIVED_NONCONSEQUENTIAL' | 'PROPOSED_WORK' | 'UNRESOLVED' | 'PROHIBITED_TO_INFER';
export type AttestationClass = 'ORDINARY' | 'COMPENSATION' | 'AVAILABILITY' | 'LEGAL' | 'DEMOGRAPHIC_EEO' | 'BACKGROUND_CHECK' | 'RELOCATION_TRAVEL' | 'PUBLICATION_VIDEO_WORK_SAMPLE';

export function compilePreparedApplication(input: PreparedApplicationInput): PreparedApplication {
  if (input.expectedCost.amountMinor !== undefined && !Number.isSafeInteger(input.expectedCost.amountMinor)) {
    throw new Error('expectedCost.amountMinor must be an integer minor-unit value');
  }
  const withoutHash = { ...input };
  return { ...withoutHash, payloadHash: hashCanonical(withoutHash) };
}
```

Define the remaining interfaces exactly as approved in the spec, including `PursuitExecutionStatus` with `NEEDS_INPUT` and all challenge/failure states.

- [ ] **Step 4: Export and run tests**

Add `export * from './pursuit.ts';` to `packages/core/src/index.ts`.
Run: `npm run build:core && node --test packages/core/test/pursuit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pursuit.ts packages/core/src/index.ts packages/core/test/pursuit.test.mjs
git commit -m "feat(core): add canonical pursuit application contracts"
```

### Task 2: Evidence, attestation, form-diff, and cost policy

**Files:**
- Create: `packages/core/src/pursuit-policy.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/pursuit-policy.test.mjs`

**Interfaces:**
- Consumes: `PreparedApplication`, `FormSchema`, `PreparedAnswer`.
- Produces: `validatePreparedApplication(app)`, `diffLiveForm(app, form)`, `evaluateSubmissionPolicy(app, form, mode)`.

- [ ] **Step 1: Write fail-closed tests**

```js
test('required unresolved legal answer blocks submission', () => {
  const result = evaluateSubmissionPolicy(appWithUnresolvedWorkAuth, workAuthForm, 'LIVE_AUTHORIZED');
  assert.deepEqual(result, { allowed: false, status: 'NEEDS_INPUT', reason: 'REQUIRED_FIELD_UNRESOLVED:work_authorization' });
});

test('new purchase blocks submission', () => {
  const result = evaluateSubmissionPolicy(appRequiringPurchase, baseForm, 'LIVE_AUTHORIZED');
  assert.equal(result.status, 'COST_CHANGED');
});

test('LIVE_INSPECT never permits submit', () => {
  assert.equal(evaluateSubmissionPolicy(validApp, baseForm, 'LIVE_INSPECT').canExecuteWrite, false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run build:core && node --test packages/core/test/pursuit-policy.test.mjs`
Expected: FAIL because policy module is absent.

- [ ] **Step 3: Implement explicit blocking classes**

```ts
const HUMAN_ONLY = new Set<AttestationClass>([
  'LEGAL', 'BACKGROUND_CHECK', 'RELOCATION_TRAVEL', 'PUBLICATION_VIDEO_WORK_SAMPLE',
]);

export function answerMayAutoFill(answer: PreparedAnswer): boolean {
  if (answer.evidenceClass === 'UNRESOLVED' || answer.evidenceClass === 'PROHIBITED_TO_INFER') return false;
  if (HUMAN_ONLY.has(answer.attestationClass)) return false;
  return answer.confidence !== 'LOW';
}
```

Implement exact live-field key comparison, required-field detection, cost comparison, and payload-expiry checks. Never infer a replacement answer for a changed form.

- [ ] **Step 4: Run focused and core tests**

Run: `npm run build:core && node --test packages/core/test/pursuit-policy.test.mjs packages/core/test/core.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pursuit-policy.ts packages/core/src/index.ts packages/core/test/pursuit-policy.test.mjs
git commit -m "feat(core): enforce pursuit evidence and form policy"
```

### Task 3: Action Gateway, idempotency, and reconciliation

**Files:**
- Create: `packages/core/src/pursuit-gateway.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/pursuit-gateway.test.mjs`

**Interfaces:**
- Consumes: existing `authorizeAction()`, `chainReceipt()`, `PreparedApplication`, `Approval`.
- Produces: `createPursuitIntent(app, route)`, `createIdempotencyKey(app, accountRef, actionType)`, `authorizePursuitAction()`, `decideRetry()`.

- [ ] **Step 1: Write tests proving payload mutation and ambiguous execution fail closed**

```js
test('approval for old payload cannot authorize mutated application', async () => {
  const result = await authorizePursuitAction(mutatedApp, oldApproval, route, now, async () => true);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'PAYLOAD_HASH_MISMATCH');
});

test('executed-unverified never retries automatically', () => {
  assert.deepEqual(decideRetry('EXECUTED_UNVERIFIED'), { retry: false, reconcile: true });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run build:core && node --test packages/core/test/pursuit-gateway.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement gateway using the existing Trust Kernel**

```ts
export function createIdempotencyKey(app: PreparedApplication, accountRef: string, actionType: string): string {
  return hashCanonical({ platform: app.targetPlatform, accountRef, opportunityId: app.opportunityId, payloadHash: app.payloadHash, actionType });
}

export function createPursuitIntent(app: PreparedApplication, route: PursuitRoute): ActionIntent {
  return { id: `${app.pursuitId}:submit`, actionType: 'SUBMIT_PURSUIT', payload: { application: app, route } };
}
```

Call existing `authorizeAction()`; do not duplicate signature or expiry logic. Add chained authorization/execution/verification receipt builders whose evidence excludes secrets.

- [ ] **Step 4: Run tests**

Run: `npm run build:core && node --test packages/core/test/pursuit-gateway.test.mjs packages/core/test/core.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pursuit-gateway.ts packages/core/src/index.ts packages/core/test/pursuit-gateway.test.mjs
git commit -m "feat(core): add authorized pursuit action gateway"
```

### Task 4: Durable pursuit state and receipt persistence

**Files:**
- Create: `database/migrations/002_pursuit_execution.sql`
- Create: `packages/postgres/src/pursuit-store.ts`
- Modify: `packages/postgres/src/index.ts`
- Test: `packages/postgres/test/pursuit-store.test.mjs`

**Interfaces:**
- Produces: `PursuitStore.savePreparedApplication`, `beginAttempt`, `recordExecution`, `recordVerification`, `findByIdempotencyKey`, `markReconciliationRequired`, `appendReceipt`.

- [ ] **Step 1: Add migration with uniqueness and redaction-friendly columns**

```sql
CREATE TABLE pursuit_applications (
  pursuit_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  application_json JSONB NOT NULL,
  prepared_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE pursuit_attempts (
  action_id TEXT PRIMARY KEY,
  pursuit_id TEXT NOT NULL REFERENCES pursuit_applications(pursuit_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  account_ref TEXT NOT NULL,
  executor_type TEXT