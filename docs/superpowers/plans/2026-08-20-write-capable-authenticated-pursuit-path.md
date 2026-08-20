# Write-Capable Authenticated Pursuit Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe authenticated write path for verified applications/bids using official APIs first and browser-assisted execution second.

**Architecture:** Discovery adapters stay read-only. A canonical `PreparedApplication` is evidence-checked, hashed, authorized through the existing Trust Kernel, routed to an API/browser executor, independently verified, and persisted with an idempotent chained receipt. Freelancer is the first API write; a generic ATS Playwright adapter is the first browser family.

**Tech Stack:** Node.js >=22.13, TypeScript 6, PostgreSQL, existing `@opportunityos/core`, Python 3 + `requests`/MCP, Playwright, Node `crypto` AES-256-GCM.

**Spec:** `docs/superpowers/specs/2026-08-20-write-capable-authenticated-pursuit-path-design.md`

## Global Constraints
- Preserve `SOURCE -> FACT -> POLICY -> APPROVAL -> ACTION -> VERIFICATION -> RECEIPT`.
- Modes are exactly `SIMULATION`, `LIVE_INSPECT`, `LIVE_AUTHORIZED`.
- No CAPTCHA/MFA/security-control bypass; challenge states halt.
- Authentication never implies authority; writes require payload-bound approval.
- No secrets in Git, logs, model-visible payloads, or receipts.
- Money is integer minor units only.
- Executor cannot self-verify; `EXECUTED_UNVERIFIED` reconciles before retry.
- New spend, contract acceptance, payout/account-security actions remain denied.
- Email remains blocked unless `nicholas@fullstackassets.com` is verified as sender.
- Existing simulation semantics and tests remain unchanged.

---

### Task 1: Canonical pursuit contracts and compiler

**Files:** Create `packages/core/src/pursuit.ts`; modify `packages/core/src/index.ts`; test `packages/core/test/pursuit.test.mjs`.

**Interfaces:** Produces `ExecutionMode`, `EvidenceClass`, `AttestationClass`, `PreparedAnswer`, `PreparedApplication`, `FormField`, `FormSchema`, `PursuitTarget`, `ExecutionResult`, `VerificationResult`, `PursuitExecutionStatus`, `compilePreparedApplication()`.

- [ ] **Step 1: Write failing compiler tests**
```js
const app = compilePreparedApplication(validInput);
assert.match(app.payloadHash, /^[a-f0-9]{64}$/);
assert.throws(() => compilePreparedApplication({ ...validInput, expectedCost: { amountMinor: 12.5, currency: 'USD', requiresPurchase: false } }), /amountMinor/);
```
- [ ] **Step 2: Verify red** — `npm run build:core && node --test packages/core/test/pursuit.test.mjs`; expect missing module/failing validation.
- [ ] **Step 3: Implement compiler**
```ts
export type ExecutionMode = 'SIMULATION'|'LIVE_INSPECT'|'LIVE_AUTHORIZED';
export function compilePreparedApplication(input: PreparedApplicationInput): PreparedApplication {
  if (input.expectedCost.amountMinor !== undefined && !Number.isSafeInteger(input.expectedCost.amountMinor)) throw new Error('expectedCost.amountMinor must be integer minor units');
  return { ...input, payloadHash: hashCanonical(input) };
}
```
Implement the remaining interfaces exactly from the approved spec; top-level availability/work-authorization convenience fields may only mirror evidenced answers.
- [ ] **Step 4: Export and verify green** — add `export * from './pursuit.ts';`; rerun focused test, expect PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(core): add pursuit application contracts"` after staging new files.

### Task 2: Evidence, form-diff, and cost policy

**Files:** Create `packages/core/src/pursuit-policy.ts`; modify `packages/core/src/index.ts`; test `packages/core/test/pursuit-policy.test.mjs`.

**Interfaces:** Produces `answerMayAutoFill()`, `diffLiveForm()`, `evaluateSubmissionPolicy()`.

- [ ] **Step 1: Write failing policy tests**
```js
assert.equal(evaluateSubmissionPolicy(appWithUnresolvedLegal, form, 'LIVE_AUTHORIZED').status, 'NEEDS_INPUT');
assert.equal(evaluateSubmissionPolicy(appRequiringPurchase, form, 'LIVE_AUTHORIZED').status, 'COST_CHANGED');
assert.equal(evaluateSubmissionPolicy(validApp, form, 'LIVE_INSPECT').canExecuteWrite, false);
```
- [ ] **Step 2: Verify red** — build + run the test; expect FAIL.
- [ ] **Step 3: Implement fail-closed rules**
```ts
export function answerMayAutoFill(a: PreparedAnswer) {
  if (['UNRESOLVED','PROHIBITED_TO_INFER'].includes(a.evidenceClass)) return false;
  if (['LEGAL','BACKGROUND_CHECK','RELOCATION_TRAVEL','PUBLICATION_VIDEO_WORK_SAMPLE'].includes(a.attestationClass)) return false;
  return a.confidence !== 'LOW';
}
```
Require exact required-field coverage, reject changed/new consequential fields, reject expired payloads and unexpected cost/credit changes.
- [ ] **Step 4: Verify green** — `npm run build:core && node --test packages/core/test/pursuit-policy.test.mjs packages/core/test/core.test.mjs`.
- [ ] **Step 5: Commit** — `feat(core): enforce pursuit evidence policy`.

### Task 3: Action Gateway, idempotency, reconciliation, receipts

**Files:** Create `packages/core/src/pursuit-gateway.ts`; modify `packages/core/src/index.ts`; test `packages/core/test/pursuit-gateway.test.mjs`.

**Interfaces:** Consumes existing `authorizeAction()`/`chainReceipt()`; produces `createPursuitIntent()`, `createIdempotencyKey()`, `authorizePursuitAction()`, `decideRetry()`, receipt builders.

- [ ] **Step 1: Write failing tests**
```js
assert.equal((await authorizePursuitAction(mutatedApp, oldApproval, route, now, verify)).reason, 'PAYLOAD_HASH_MISMATCH');
assert.deepEqual(decideRetry('EXECUTED_UNVERIFIED'), { retry:false, reconcile:true });
```
- [ ] **Step 2: Verify red**.
- [ ] **Step 3: Implement without duplicating Trust Kernel**
```ts
export const createIdempotencyKey = (app, accountRef, actionType) => hashCanonical({ platform:app.targetPlatform, accountRef, opportunityId:app.opportunityId, payloadHash:app.payloadHash, actionType });
export const createPursuitIntent = (app, route) => ({ id:`${app.pursuitId}:submit`, actionType:'SUBMIT_PURSUIT', payload:{ application:app, route } });
```
Authorization calls existing `authorizeAction()`. Receipt evidence contains IDs/hashes/status/cost only, never secrets.
- [ ] **Step 4: Verify green** with gateway + core tests.
- [ ] **Step 5: Commit** — `feat(core): add pursuit action gateway`.

### Task 4: Durable pursuit execution store

**Files:** Create `database/migrations/002_pursuit_execution.sql`, `packages/postgres/src/pursuit-store.ts`, `packages/postgres/test/pursuit-store.test.mjs`; modify `packages/postgres/src/index.ts`.

**Interfaces:** `savePreparedApplication()`, `beginAttempt()`, `recordExecution()`, `recordVerification()`, `findByIdempotencyKey()`, `markReconciliationRequired()`, `appendReceipt()`.

- [ ] **Step 1: Write migration**
```sql
CREATE TABLE pursuit_applications (pursuit_id TEXT PRIMARY KEY, opportunity_id TEXT NOT NULL, platform TEXT NOT NULL, payload_hash TEXT NOT NULL, application_json JSONB NOT NULL, prepared_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE pursuit_attempts (action_id TEXT PRIMARY KEY, pursuit_id TEXT NOT NULL REFERENCES pursuit_applications(pursuit_id), idempotency_key TEXT NOT NULL UNIQUE, account_ref TEXT NOT NULL, executor_type TEXT NOT NULL, status TEXT NOT NULL, external_id TEXT, reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE pursuit_receipts (receipt_hash TEXT PRIMARY KEY, action_id TEXT NOT NULL, previous_receipt_hash TEXT, receipt_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);
```
- [ ] **Step 2: Write failing store tests** proving duplicate idempotency keys are rejected and `EXECUTED_UNVERIFIED` persists `reconciliation_required=true`.
- [ ] **Step 3: Implement parameterized SQL store**; never persist credential/session bodies.
- [ ] **Step 4: Verify** — `npm run build --workspace @opportunityos/postgres && node --test packages/postgres/test/*.test.mjs`.
- [ ] **Step 5: Commit** — `feat(postgres): persist pursuit execution state`.

### Task 5: Credential and Session Brokers with encrypted storage

**Files:** Create `packages/pursuit-execution/{package.json,tsconfig.json,src/index.ts,src/encrypted-store.ts,src/credential-broker.ts,src/session-broker.ts}` and tests under `packages/pursuit-execution/test/`.

**Interfaces:** `EncryptedStore.put/get/delete`; `CredentialBroker.resolve(ref, action)`; `SessionBroker.resolve(ref, action)`; both return opaque metadata + in-process secret material only to executors.

- [ ] **Step 1: Add workspace package** depending on `@opportunityos/core`; dev-depend on Playwright later in Task 7.
- [ ] **Step 2: Write failing encryption/scope tests**: ciphertext must not contain plaintext token; wrong key must fail; denied action scope must return `NEEDS_HUMAN_AUTH`; account mismatch must return `ACCOUNT_MISMATCH`.
- [ ] **Step 3: Implement AES-256-GCM envelope**
```ts
const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm', key, iv); const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]); const tag=cipher.getAuthTag();
```
Require a 32-byte key decoded from `PURSUIT_SECRET_KEY_BASE64`; refuse startup if malformed. Store browser `storageState` encrypted, not a persistent plaintext profile directory.
- [ ] **Step 4: Implement broker scope/account checks** before returning secret material.
- [ ] **Step 5: Verify** — build package + run its tests; then commit `feat(execution): add credential and session brokers`.

### Task 6: Executor router and independent verifier registry

**Files:** Create `packages/pursuit-execution/src/router.ts`, `src/verifier.ts`; tests `router.test.mjs`, `verifier.test.mjs`.

**Interfaces:** `PursuitExecutor.inspect/validate/execute`; separate `PursuitVerifier.verify`; `routeExecutor(capabilities)` prefers official API.

- [ ] **Step 1: Write failing tests** proving API beats browser, `LIVE_INSPECT` cannot call execute, and executor `success:true` alone cannot yield `SUBMITTED_VERIFIED`.
- [ ] **Step 2: Implement route order** `official_api -> browser -> UNAVAILABLE` and enforce mode at the router boundary.
- [ ] **Step 3: Implement verifier registry** accepting durable external IDs/dashboard/confirmation evidence; screenshot-only evidence remains insufficient when a durable identifier is expected.
- [ ] **Step 4: Verify package tests**.
- [ ] **Step 5: Commit** — `feat(execution): route and independently verify pursuit writes`.

### Task 7: Generic ATS Playwright executor

**Files:** Create `packages/pursuit-execution/src/browser/{field-classifier.ts,challenge-detector.ts,ats-executor.ts}`, provider files `providers/{generic,ashby,lever,greenhouse}.ts`, fixtures/tests; modify package dependency to `playwright`.

**Interfaces:** `classifyField()`, `detectChallenge(page)`, `AtsExecutor.inspect/validate/execute`.

- [ ] **Step 1: Create local HTML fixtures** for normal form, added legal field, CAPTCHA text/iframe marker, MFA/password challenge, account mismatch, cost change, timeout-after-submit, confirmation with application ID.
- [ ] **Step 2: Write failing browser tests**: CAPTCHA=>`CAPTCHA_REQUIRED`; MFA=>`MFA_REQUIRED`; added required legal field=>`PAYLOAD_CHANGED`/`NEEDS_INPUT`; `LIVE_INSPECT` fills nothing and submits nothing; confirmation ID is returned as execution evidence.
- [ ] **Step 3: Implement semantic field classifier** using label/name/type/autocomplete text; provider modules only map provider DOM to canonical `FormSchema`, never invent answers.
- [ ] **Step 4: Implement challenge detection before fill and immediately before submit**. Upload only approved `requiredUploads`; no public post/video/work-sample automation.
- [ ] **Step 5: Verify** — `npx playwright install chromium` then package browser tests; commit `feat(execution): add guarded ATS browser executor`.

### Task 8: Freelancer official bid executor

**Files:** Keep `connectors/freelancer/freelancer_mcp_server.py` unchanged; create `connectors/freelancer/freelancer_pursuit_server.py` and `connectors/freelancer/tests/test_freelancer_pursuit_server.py`; update README.

**Interfaces:** MCP tools `inspect_freelancer_bid(project_id)`, `submit_freelancer_bid(authorized_payload)`, `verify_freelancer_bid(bid_id, project_id)`.

The official Freelancer SDK documents authenticated bid creation and maps it to `POST /projects/0.1/bids`; use the existing OAuth bearer token and API base rather than private endpoints.

- [ ] **Step 1: Write mocked failing tests** for missing token, mismatched bidder/project, successful `POST /projects/0.1/bids`, 401/403, and durable bid-ID verification.
- [ ] **Step 2: Implement inspect** using official current-user/project endpoints; return account/project identity and bid requirements, never a write.
- [ ] **Step 3: Implement submit** with exact approved fields only: `project_id`, verified `bidder_id`, integer/decimal API amount derived from approved minor units, `period`, `milestone_percentage`, `description`; reject extra financial/account actions.
- [ ] **Step 4: Implement independent verify path** using `GET /projects/0.1/bids/{bid_id}` or project-bid retrieval and require matching bid/project/bidder identity.
- [ ] **Step 5: Verify** — `python -m unittest discover connectors/freelancer/tests`; confirm original read-only connector tests still pass; commit `feat(freelancer): add scoped official bid executor`.

### Task 9: Runtime integration, canary harness, environment, and CI

**Files:** Modify `apps/worker/src/main.ts`, `.env.example`, root `package.json`; create `scripts/pursuit-canary.ts`, `apps/control-plane/app/api/pursuits/inspect/route.ts`, `apps/control-plane/app/api/pursuits/status/route.ts`.

**Interfaces:** Worker accepts pursuit jobs only through gateway; control plane exposes inspect/status, not secrets; canary supports `--mode live-inspect|live-authorized`.

- [ ] **Step 1: Add environment contract**
```env
OPPORTUNITYOS_EXECUTION_MODE=simulation
PURSUIT_SECRET_KEY_BASE64=
PURSUIT_SESSION_STORE_PATH=.local/pursuit-sessions.enc
FREELANCER_ACCESS_TOKEN=
```
Add `.local/` to `.gitignore`; never commit generated encrypted blobs.
- [ ] **Step 2: Wire worker dispatch** so `simulation` continues current `runSimulationWorkOrder`; pursuit jobs require explicit mode, prepared payload, route, and approval.
- [ ] **Step 3: Add inspect/status API routes** returning canonical form/session health/result state with secret fields removed.
- [ ] **Step 4: Add canary harness**: Gate A runs auth/session identity + inspect only; Gate B compiles/diffs real forms; Gate C refuses `live-authorized` without an exact approval file/hash and prints the idempotency key before execution.
- [ ] **Step 5: Update root scripts** to build/typecheck/test `@opportunityos/pursuit-execution` and run Freelancer Python tests separately. Run `npm test && npm run typecheck && npm run build && npm run smoke`; expect all existing simulation checks to pass.
- [ ] **Step 6: Commit** — `feat: wire authenticated pursuit execution runtime`.

### Task 10: Gate A/B/C verification and production enablement

**Files:** Create `docs/