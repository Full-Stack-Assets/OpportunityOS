# Authenticated Pursuit Canary Rollout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This appendix begins only after Tasks 1–9 in `2026-08-20-write-capable-authenticated-pursuit-path.md` pass.

**Goal:** Prove real authentication, fail-closed inspection, one official-API bid, and one ATS browser application before enabling policy-governed auto-apply.

**Spec:** `docs/superpowers/specs/2026-08-20-write-capable-authenticated-pursuit-path-design.md`

## Gate A: Live authentication, zero writes

**Files:** Create `docs/operations/pursuit-write-canary.md`; no production configuration change yet.

- [ ] **Step 1: Configure secrets outside Git** — set `PURSUIT_SECRET_KEY_BASE64`, Freelancer OAuth token, and one encrypted ATS `storageState` through the brokers.
- [ ] **Step 2: Run Freelancer inspect**
```bash
node --experimental-strip-types scripts/pursuit-canary.ts --platform freelancer --mode live-inspect
```
Expected: verified account ID + project/form metadata, `externalSideEffects=0`.
- [ ] **Step 3: Run ATS inspect**
```bash
node --experimental-strip-types scripts/pursuit-canary.ts --platform ats --mode live-inspect
```
Expected: provider/account/form schema, no uploads/fills/submission.
- [ ] **Step 4: Exercise challenge fixtures** — CAPTCHA=>`CAPTCHA_REQUIRED`; MFA=>`MFA_REQUIRED`; wrong account=>`ACCOUNT_MISMATCH`.
- [ ] **Step 5: Record Gate A evidence** in `docs/operations/pursuit-write-canary.md` using only account refs, hashes, statuses, timestamps; no secrets.

## Gate B: Real application compilation and live-form diff

- [ ] **Step 1: Select two currently qualifying Firehose opportunities**: one Freelancer project and one ATS-hosted paid remote/MA/RI role.
- [ ] **Step 2: Compile both into `PreparedApplication` objects** with exact resume artifact, proposal/answers, evidence refs, `amountMinor`, expiry, and payload hash.
- [ ] **Step 3: Inspect live forms and diff**; intentionally leave one legal/work-auth field unresolved in a fixture copy and verify `NEEDS_INPUT`.
- [ ] **Step 4: Mutate a prepared answer after approval in a test copy and verify `PAYLOAD_HASH_MISMATCH`.
- [ ] **Step 5: Record Gate B evidence**: payload hashes, form-schema hashes, blocked-state proof, zero external writes.

## Gate C1: Official Freelancer API canary

- [ ] **Step 1: Human Authority selects the exact paid Freelancer opportunity and reviews the final bid payload.**
- [ ] **Step 2: Create a payload-bound approval** using the existing Trust Kernel; record approval ID, expiry, payload hash, and idempotency key.
- [ ] **Step 3: Execute exactly once**
```bash
node --experimental-strip-types scripts/pursuit-canary.ts --platform freelancer --mode live-authorized --approval ./local-approval.json
```
Expected: executor returns bid ID but not verified success.
- [ ] **Step 4: Run independent verifier**; require official bid read matching project ID, bidder ID, and bid ID.
- [ ] **Step 5: Persist chained receipt**. Only verifier-confirmed evidence may set `SUBMITTED_VERIFIED`; timeout/ambiguity must set `EXECUTED_UNVERIFIED` and reconciliation-required.
- [ ] **Step 6: Re-run the same command** and prove idempotency returns `ALREADY_SUBMITTED` or the prior verified result without a second bid.

## Gate C2: ATS browser canary

- [ ] **Step 1: Human Authority selects the exact paid ATS role and reviews the final application payload.**
- [ ] **Step 2: Run `LIVE_INSPECT` immediately before authorization**; any new required field, cost, challenge, or account mismatch invalidates the attempt.
- [ ] **Step 3: Create exact payload-bound approval and execute once** through `AtsExecutor`.
- [ ] **Step 4: Independently verify** using durable confirmation ID, application dashboard state, or provider confirmation record. Screenshot is supporting evidence only.
- [ ] **Step 5: Persist receipt and repeat identical request** to prove duplicate prevention.

## Gate D: Policy-governed auto-apply enablement

Gate D is allowed only when all statements below are evidenced in `docs/operations/pursuit-write-canary.md`:

- [ ] No secret appeared in logs, DB application JSON, errors, or receipts.
- [ ] `LIVE_INSPECT` produced zero external writes.
- [ ] CAPTCHA/MFA/account mismatch always halted.
- [ ] Changed form and unresolved legal facts halted.
- [ ] Unexpected spend halted.
- [ ] API and browser canaries each produced durable independent verification.
- [ ] Duplicate/retry tests produced zero duplicate submissions.
- [ ] Existing `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` remain green.

After all checks pass, change only the deployment/runtime policy needed to permit `LIVE_AUTHORIZED` for the already-approved MEDIUM+ auto-apply policy. Do not broaden allowed action scopes. Persist the Gate D decision as a Canon receipt with the canary evidence hashes.

## Final verification command
```bash
npm test && npm run typecheck && npm run build && npm run smoke && python -m unittest discover connectors/freelancer/tests
```
Expected: all commands exit 0; canary evidence shows one verified API submission and one verified browser submission with no duplicates.