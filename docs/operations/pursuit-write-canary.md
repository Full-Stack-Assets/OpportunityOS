# Pursuit Write Canary Operations Ledger

This document records rollout evidence for the authenticated pursuit write path. It must never contain access tokens, cookies, passwords, MFA material, raw browser storage state, HMAC keys, or other secret bodies.

## Safety baseline

- Production/live writes remain disabled by default.
- `FREELANCER_LIVE_WRITES_ENABLED=false` is the default environment contract.
- `.local/` is ignored by Git.
- ATS browser storage state must be sealed with AES-256-GCM before use; only the encrypted `.enc` file may persist locally.
- `LIVE_INSPECT` must produce `externalSideEffects: 0`.
- CAPTCHA, MFA, session expiry, and account mismatch halt execution.
- `LIVE_AUTHORIZED` requires an exact payload-bound Trust Kernel approval and a separate HMAC verification key.
- A write result is never considered submitted until independent verification returns durable external evidence.

## Provisioning commands

Generate two independent 32-byte keys outside Git and place them only in the runtime secret store/environment:

```bash
openssl rand -base64 32   # PURSUIT_SECRET_KEY_BASE64
openssl rand -base64 32   # PURSUIT_APPROVAL_HMAC_KEY_BASE64
```

After a one-time human browser login creates a Playwright `storageState` JSON file, seal it immediately:

```bash
PURSUIT_SECRET_KEY_BASE64='***' npm run pursuit:seal-session -- --input /tmp/ats-storage-state.json --output .local/ats-storage-state.enc
rm -f /tmp/ats-storage-state.json
```

Install Chromium for the local canary runtime if not already present:

```bash
npx playwright install chromium
```

## Gate A — live authentication, zero writes

### A1. Freelancer inspect

```bash
FREELANCER_ACCESS_TOKEN='***' \
FREELANCER_ACCOUNT_ID='<expected numeric account id>' \
npm run pursuit:canary -- --platform freelancer --mode live-inspect --project-id <active-project-id>
```

Required evidence: `INSPECT_VERIFIED`, redacted account reference, project ID, project metadata, `externalSideEffects: 0`.

### A2. ATS inspect

```bash
PURSUIT_SECRET_KEY_BASE64='***' \
PURSUIT_ATS_STORAGE_STATE_ENC_PATH=.local/ats-storage-state.enc \
npm run pursuit:canary -- --platform ats --mode live-inspect --target-url '<application-url>' --opportunity-id '<id>'
```

Required evidence: provider/application URL, redacted form schema, `externalSideEffects: 0`. No fill, upload, or submit is allowed during this gate.

### A3. Challenge fixtures

```bash
npm run pursuit:canary -- --fixture captcha
npm run pursuit:canary -- --fixture mfa
npm run pursuit:canary -- --fixture account-mismatch
```

Expected statuses: `CAPTCHA_REQUIRED`, `MFA_REQUIRED`, `ACCOUNT_MISMATCH`; all with `externalSideEffects: 0`.

## Gate A evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Code/CI baseline | PENDING_CURRENT_HEAD_CI | Latest implementation must pass full CI before authentication canary. |
| Freelancer authenticated inspect | BLOCKED_ON_SECRET_PROVISIONING | Requires OAuth token + verified numeric account ID + active project ID. |
| ATS authenticated inspect | BLOCKED_ON_HUMAN_LOGIN_SESSION | Requires one-time human login and sealed Playwright storage state. |
| CAPTCHA fixture | READY | Canary harness fixture is implemented. |
| MFA fixture | READY | Canary harness fixture is implemented. |
| Account mismatch fixture | READY | Canary harness fixture is implemented. |
| External writes | ZERO_BY_POLICY | Live writes remain disabled. |

## Gate B — application compilation/live-form diff

Not started. Begin only after both Gate A authenticated inspections succeed and their redacted evidence is recorded here.

## Gate C1 — Freelancer official API write canary

Not authorized. Requires Human Authority to select the exact paid opportunity and review the final payload before `FREELANCER_LIVE_WRITES_ENABLED=true` may be used for one bounded attempt.

## Gate C2 — ATS browser write canary

Not authorized. A provider-specific ATS write driver and exact Human Authority approval are required before this gate.

## Gate D — policy-governed auto-apply

DISABLED. Gate D cannot be enabled until C1 and C2 each produce independently verified durable receipts and duplicate-prevention evidence.
