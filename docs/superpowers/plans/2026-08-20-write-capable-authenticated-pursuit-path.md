# Write-Capable Authenticated Pursuit Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe authenticated write path for verified applications/bids using official APIs first and browser-assisted execution second.

**Architecture:** Keep discovery adapters read-only. Compile an evidence-aware `PreparedApplication`, hash and authorize it through the existing Trust Kernel, route it to an API/browser executor, independently verify the external result, and persist an idempotent chained receipt. Freelancer is the first API write; a generic ATS Playwright adapter is the first browser family.

**Tech Stack:** Node.js >=22.13, TypeScript 6, PostgreSQL, `@opportunityos/core`, Python 3 + `requests`/MCP, Playwright, Node `crypto` AES-256-GCM.

**Spec:** `docs/superpowers/specs/2026-08-20-write-capable-authenticated-pursuit-path-design.md`

## Global Constraints
- Preserve `SOURCE -> FACT -> POLICY -> APPROVAL -> ACTION -> VERIFICATION -> RECEIPT`.
- Modes: `SIMULATION`, `LIVE_INSPECT`, `LIVE_AUTHORIZED` only.
- CAPTCHA/MFA/security challenges halt; no bypass behavior.
- Authentication never implies authority; every write is payload-bound.
- No secrets in Git/logs/model payloads/receipts; money uses integer minor units.
- Executor cannot self-verify; `EXECUTED_UNVERIFIED` reconciles before retry.
- New spend, contract/payout/account-security actions remain denied.
- Email remains blocked unless `nicholas@fullstackassets.com` is verified as sender.
- Existing simulation behavior and tests remain unchanged.

---

### Task 1: Canonical pursuit contracts and compiler

**Files:** Create `packages/core/src/pursuit.ts`; modify `packages/core/src/index.ts`; test `packages/core/test/pursuit.test.mjs`.

**Interfaces:** Produce `ExecutionMode`, `EvidenceClass`, `AttestationClass`, `PreparedAnswer`, `PreparedApplication`, `FormSchema`, `PursuitTarget`, `ExecutionResult`, `VerificationResult`, `PursuitExecutionStatus`, `compilePreparedApplication()`.

- [ ] **Step 1: Write failing tests**
```js
const app = compilePreparedApplication(validInput);
assert.match(app.payloadHash, /^[a-f0-9]{64}$/);
assert.throws(() => compilePreparedApplication({...validInput,expectedCost:{amountMinor:12.5,currency:'USD',requiresPurchase:false}}), /amountMinor/);
```
- [ ] **Step 2: Verify red** — `npm run build:core && node --test packages/core/test/pursuit.test.mjs`; expect FAIL.
- [ ] **Step 3: Implement**
```ts
export type ExecutionMode='SIMULATION'|'LIVE_INSPECT'|'LIVE_AUTHORIZED';
export function compilePreparedApplication(input:PreparedApplicationInput):PreparedApplication{
 if(input.expectedCost.amountMinor!==undefined&&!Number.isSafeInteger(input.expectedCost.amountMinor)) throw new Error('expectedCost.amountMinor must be integer minor units');
 return {...input,payloadHash:hashCanonical(input)};
}
```
Define all remaining fields/statuses exactly from the spec. Top-level availability/work-auth values may only mirror evidenced answers.
- [ ] **Step 4: Export, rerun test, expect PASS.**
- [ ] **Step 5: Commit** — `feat(core): add pursuit application contracts`.

### Task 2: Evidence, form-diff, and cost policy

**Files:** Create `packages/core/src/pursuit-policy.ts`; modify `index.ts`; test `pursuit-policy.test.mjs`.

**Interfaces:** `answerMayAutoFill()`, `diffLiveForm()`, `evaluateSubmissionPolicy()`.

- [ ] **Step 1: Write failing tests**
```js
assert.equal(evaluateSubmissionPolicy(unresolvedLegal,form,'LIVE_AUTHORIZED').status,'NEEDS_INPUT');
assert.equal(evaluateSubmissionPolicy(purchaseApp,form,'LIVE_AUTHORIZED').status,'COST_CHANGED');
assert.equal(evaluateSubmissionPolicy(validApp,form,'LIVE_INSPECT').canExecuteWrite,false);
```
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement fail-closed classification**
```ts
export function answerMayAutoFill(a:PreparedAnswer){
 if(['UNRESOLVED','PROHIBITED_TO_INFER'].includes(a.evidenceClass)) return false;
 if(['LEGAL','BACKGROUND_CHECK','RELOCATION_TRAVEL','PUBLICATION_VIDEO_WORK_SAMPLE'].includes(a.attestationClass)) return false;
 return a.confidence!=='LOW';
}
```
Require exact required-field coverage, payload freshness, and unchanged cost/credits; never invent a changed answer.
- [ ] **Step 4: Run policy + core tests; expect PASS.**
- [ ] **Step 5: Commit** — `feat(core): enforce pursuit evidence policy`.

### Task 3: Action Gateway, idempotency, reconciliation, receipts

**Files:** Create `packages/core/src/pursuit-gateway.ts`; modify `index.ts`; test `pursuit-gateway.test.mjs`.

**Interfaces:** Reuse `authorizeAction()`/`chainReceipt()`; produce `createPursuitIntent()`, `createIdempotencyKey()`, `authorizePursuitAction()`, `decideRetry()`.

- [ ] **Step 1: Write failing tests**
```js
assert.equal((await authorizePursuitAction(mutated,oldApproval,route,now,verify)).reason,'PAYLOAD_HASH_MISMATCH');
assert.deepEqual(decideRetry('EXECUTED_UNVERIFIED'),{retry:false,reconcile:true});
```
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement**
```ts
export const createIdempotencyKey=(a,accountRef,actionType)=>hashCanonical({platform:a.targetPlatform,accountRef,opportunityId:a.opportunityId,payloadHash:a.payloadHash,actionType});
export const createPursuitIntent=(a,route)=>({id:`${a.pursuitId}:submit`,actionType:'SUBMIT_PURSUIT',payload:{application:a,route}});
```
Call existing Trust Kernel for signature/expiry/hash checks. Receipt evidence stores IDs/hashes/status/cost, never secrets.
- [ ] **Step 4: Run gateway + core tests; expect PASS.**
- [ ] **Step 5: Commit** — `feat(core): add pursuit action gateway`.

### Task 4: Durable pursuit store

**Files:** Create `database/migrations/002_pursuit_execution.sql`, `packages/postgres/src/pursuit-store.ts`, `packages/postgres/test/pursuit-store.test.mjs`; modify postgres `index.ts`.

**Interfaces:** `savePreparedApplication`, `beginAttempt`, `recordExecution`, `recordVerification`, `findByIdempotencyKey`, `markReconciliationRequired`, `appendReceipt`.

- [ ] **Step 1: Add migration**
```sql
CREATE TABLE pursuit_applications(pursuit_id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL,platform TEXT NOT NULL,payload_hash TEXT NOT NULL,application_json JSONB NOT NULL,prepared_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE pursuit_attempts(action_id TEXT PRIMARY KEY,pursuit_id TEXT NOT NULL REFERENCES pursuit_applications(pursuit_id),idempotency_key TEXT NOT NULL UNIQUE,account_ref TEXT NOT NULL,executor_type TEXT NOT NULL,status TEXT NOT NULL,external_id TEXT,reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE pursuit_receipts(receipt_hash TEXT PRIMARY KEY,action_id TEXT NOT NULL,previous_receipt_hash TEXT,receipt_json JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL);
```
- [ ] **Step 2: Write failing tests** for duplicate idempotency and reconciliation flag.
- [ ] **Step 3: Implement parameterized SQL store; never persist secret bodies.**
- [ ] **Step 4: Run postgres build/tests; expect PASS.**
- [ ] **Step 5: Commit** — `feat(postgres): persist pursuit execution state`.

### Task 5: Credential and Session Brokers

**Files:** Create package `packages/pursuit-execution/` with `package.json`, `tsconfig.json`, `src/{index,encrypted-store,credential-broker,session-broker}.ts`, tests.

**Interfaces:** `EncryptedStore.put/get/delete`, `CredentialBroker.resolve(ref,action)`, `SessionBroker.resolve(ref,action)`.

- [ ] **Step 1: Add workspace package depending on `@opportunityos/core`.**
- [ ] **Step 2: Write failing tests**: ciphertext excludes plaintext token; wrong key fails; denied scope=>`NEEDS_HUMAN_AUTH`; wrong account=>`ACCOUNT_MISMATCH`.
- [ ] **Step 3: Implement AES-256-GCM**
```ts
const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([c.update(plain),c.final()]);const tag=c.getAuthTag();
```
Require exactly 32 decoded bytes from `PURSUIT_SECRET_KEY_BASE64`. Encrypt browser `storageState`; do not keep plaintext profiles.
- [ ] **Step 4: Implement scope/account checks before secret resolution; run tests.**
- [ ] **Step 5: Commit** — `feat(execution): add credential and session brokers`.

### Task 6: Executor router and independent verifier

**Files:** Create `packages/pursuit-execution/src/{router,verifier}.ts`; tests `router.test.mjs`, `verifier.test.mjs`.

**Interfaces:** `PursuitExecutor.inspect/validate/execute`; separate `PursuitVerifier.verify`; `routeExecutor()`.

- [ ] **Step 1: Write failing tests** proving API beats browser, `LIVE_INSPECT` cannot execute, and executor `success:true` alone cannot produce `SUBMITTED_VERIFIED`.
- [ ] **Step 2: Implement route order** `official_api -> browser -> UNAVAILABLE` and mode enforcement.
- [ ] **Step 3: Implement verifier registry** requiring durable external ID/dashboard/confirmation evidence; screenshots are supporting evidence only.
- [ ] **Step 4: Run package tests; expect PASS.**
- [ ] **Step 5: Commit** — `feat(execution): route and independently verify pursuit writes`.

### Task 7: Generic ATS Playwright executor

**Files:** Create `src/browser/{field-classifier,challenge-detector,ats-executor}.ts`, `providers/{generic,ashby,lever,greenhouse}.ts`, HTML fixtures/tests; add `playwright` dependency.

**Interfaces:** `classifyField()`, `detectChallenge(page)`, `AtsExecutor.inspect/validate/execute`.

- [ ] **Step 1: Create fixtures** for normal, added legal field, CAPTCHA, MFA, wrong account, cost change, timeout, and confirmation-ID pages.
- [ ] **Step 2: Write failing tests**: CAPTCHA=>`CAPTCHA_REQUIRED`; MFA=>`MFA_REQUIRED`; added legal field=>`NEEDS_INPUT`; `LIVE_INSPECT` never submits; confirmation returns durable ID.
- [ ] **Step 3: Implement field classifier** from label/name/type/autocomplete; provider modules map DOM to `FormSchema` only.
- [ ] **Step 4: Implement challenge checks before fill and before submit; upload only approved artifacts.**
- [ ] **Step 5: Run `npx playwright install chromium` and browser tests; commit `feat(execution): add guarded ATS browser executor`.**

### Task 8: Freelancer official bid executor

**Files:** Keep `freelancer_mcp_server.py` read-only; create `connectors/freelancer/freelancer_pursuit_server.py` and test; update README.

**Interfaces:** MCP tools `inspect_freelancer_bid(project_id)`, `submit_freelancer_bid(authorized_payload)`, `verify_freelancer_bid(bid_id,project_id)`.

Freelancer's official SDK documents authenticated bid creation through `POST /projects/0.1/bids`; use the existing bearer token/API base, never private endpoints.

- [ ] **Step 1: Write mocked failing tests** for missing token, mismatched identity, successful POST, 401/403, and bid-ID verification.
- [ ] **Step 2: Implement inspect** using official current-user/project reads; no write.
- [ ] **Step 3: Implement submit with approved fields only**
```py
payload={'project_id':project_id,'bidder_id':bidder_id,'amount':amount,'period':period,'milestone_percentage':milestone,'description':description}
r=requests.post(f'{API}/projects/0.1/bids',headers=auth_headers,json=payload,timeout=10)
```
Reject extra financial/account actions.
- [ ] **Step 4: Verify independently** via official bid/project-bid read and require matching bid/project/bidder IDs.
- [ ] **Step 5: Run `python -m unittest discover connectors/freelancer/tests`; original read-only tests must still pass; commit `feat(freelancer): add scoped official bid executor`.**

### Task 9: Runtime, canary harness, environment, CI

**Files:** Modify `apps/worker/src/main.ts`, `.env.example`, `.gitignore`, root `package.json`; create `scripts/pursuit-canary.ts`, `apps/control-plane/app/api/pursuits/{inspect,status}/route.ts`.

**Interfaces:** Worker dispatches only through gateway; control plane exposes redacted inspect/status; canary accepts `--mode live-inspect|live-authorized`.

- [ ] **Step 1: Add environment contract**
```env
OPPORTUNITYOS_EXECUTION_MODE=simulation
PURSUIT_SECRET_KEY_BASE64=
PURSUIT_SESSION_STORE_PATH=.local/pursuit-sessions.enc
FREELANCER_ACCESS_TOKEN=
```
Ignore `.local/`.
- [ ] **Step 2: Wire worker**: existing simulation path remains untouched; pursuit jobs require mode + prepared payload + route + approval.
- [ ] **Step 3: Add redacted inspect/status routes**; never return secret/session bodies.
- [ ] **Step 4: Add canary harness**: Gate A authenticates/inspects only; Gate B compiles/diffs; Gate C refuses live write without exact approval hash and prints idempotency key before execution.
- [ ] **Step 5: Add pursuit package and Python connector tests to root scripts. Run `npm test && npm run typecheck && npm run build && npm run smoke`; expect all simulation checks PASS.**
- [ ] **Step 6: Commit** — `feat: wire authenticated pursuit execution runtime`.

### Task 10: Gate A/B/C evidence and Gate D enablement

**Files:** Create `docs/operations/pursuit-write-canary.md`; update only configuration after evidence passes.

**Interfaces:** Produces a reproducible canary record with account ref, payload hash, approval ID, idempotency key, execution result, verifier evidence, receipt hash; never secret values.

- [ ] **Step 1: Gate A** — run `LIVE_INSPECT` against one authenticated Freelancer account and one ATS session; verify identity, form inspection, CAPTCHA/MFA halt behavior, and **zero writes**.
- [ ] **Step 2: Gate B** — compile two real Firehose applications and prove unresolved legal/cost/form changes halt before authorization.
- [ ] **Step 3: Gate C API canary** — Human Authority selects one paid Freelancer opportunity; create exact payload