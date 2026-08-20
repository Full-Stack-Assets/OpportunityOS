# Opportunity Pipeline Human Handoff — Remaining External Gates

Status date: 2026-08-20

This runbook contains only the actions that still require Human Authority, provider approval, account administration, or credentials. OpportunityOS must continue to enforce the invariant:

`SOURCE -> FACT -> POLICY -> AUTHORITY -> ACTION -> VERIFICATION -> RECEIPT`

Do not mark a provider healthy, writable, or verified from intent alone. Complete the provider-specific verification gate and attach the resulting evidence to Canon before changing its capability manifest.

## Current operational status

| Provider | Current state | What OpportunityOS can already do | Remaining Human Authority/provider action |
| --- | --- | --- | --- |
| Gmail | `UNVERIFIED` | Explicitly preserves search failure; never converts it to “no inbound” | Repair/confirm the Gmail mailbox service, reconnect if needed, then pass all three controlled search probes |
| Outlook | `HEALTHY` fallback | Search mailbox and provide verified inbound coverage while Gmail is degraded | Keep authentication current; no immediate repair required |
| Contra | `DEGRADED` in this runtime | Installed connector is known and application/message writes remain confirmation-bound | Use a runtime where the Contra tool namespace is exposed; verify live read + preview/confirm operations |
| Freelancer | `PERMISSION_REQUIRED` | Public project discovery, local bid/message preparation, governed official-API bid/message implementation | Obtain/retain express written automation permission, provision OAuth token, enable the permission flag, verify authenticated reads |
| Upwork | `PERMISSION_REQUIRED` | Provider-neutral application package preparation | Obtain an approved API key/use case; do not use browser automation as a substitute |
| Fiverr | `MANUAL_ONLY` for marketplace writes | Provider-neutral response/application preparation from approved input | Obtain a Fiverr-approved integration/permission before any machine write; otherwise keep final action manual |

The machine-readable snapshot is `config/opportunity-provider-status.current.json`. Treat its `expires_at` timestamp as a revalidation requirement rather than permanent policy truth.

---

## 1. Gmail — repair `FAILED_PRECONDITION`

### What has been verified

The connected Google identity resolves, but both a Gmail message-ID search and Gmail label listing fail with the same `failedPrecondition` / `search_failed_precondition` state. Because a non-search mailbox operation fails identically, do not spend time rewriting Gmail query syntax until the mailbox/service state is confirmed.

Until a successful Gmail search occurs, Gmail remains `UNVERIFIED` even when Outlook successfully supplies fallback inbound coverage.

### Human steps

1. Sign in directly to Gmail with the exact Google identity connected to OpportunityOS and confirm that the Gmail mailbox UI itself loads and can display mail.
2. If this is a Google Workspace account, sign in to the Google Admin console with an administrator account and confirm that Gmail is activated for the domain/user.
3. If Gmail is intended to host mail for the domain, verify the domain's MX records and Gmail activation. Google's current Workspace instructions require the domain's mail routing to point to Google and then require Gmail activation in Admin Console.
4. If the domain intentionally uses a different mail host and the Google identity does **not** have a Gmail mailbox, do not try to force the Gmail connector to represent that external mailbox. Keep Outlook (or the actual provider) as the verified mailbox source.
5. After mailbox/service state is known-good, reconnect/re-authorize the Gmail integration if the product UI offers that option. Do not reuse or export browser cookies/session material.
6. Run the controlled validation sequence below.

### Controlled validation sequence

Use three independent provider calls. Every call must return a successful Gmail search response—not merely a valid OAuth profile.

**Probe A — search endpoint health**

Search a broad harmless recent window, for example:

`in:anywhere newer_than:30d`

Pass criterion: the provider returns a valid search result object. Zero matches are acceptable for this probe.

**Probe B — verified negative**

Search for a unique impossible subject token that has never existed, for example:

`subject:"OPPORTUNITYOS-GMAIL-NO-MATCH-<unique-token>"`

Pass criterion: successful search + zero message IDs. OpportunityOS maps this to `NO_MATCHING_INBOUND_ACTIVITY`.

**Probe C — verified positive**

Send or identify a known message containing a unique stable token, then search for that exact token.

Pass criterion: successful search + at least one matching message ID. OpportunityOS maps this to `NEW_INBOUND_ACTIVITY`.

If **any** probe returns `FAILED_PRECONDITION`, authentication failure, timeout, rate limit, malformed response, or another provider error, Gmail remains `UNVERIFIED`.

### If direct Gmail works but API calls still fail

Open a Google Workspace support case from the Admin console and include:

- affected Google identity;
- timestamp and timezone of the failed API probes;
- that both message listing/search and label listing return HTTP/API `FAILED_PRECONDITION`;
- confirmation that the Gmail web UI works;
- domain Gmail activation/service status;
- whether MX records point to Google;
- the fact that OAuth identity/profile resolution succeeds while mailbox API operations do not.

Do not include OAuth tokens, cookies, passwords, recovery codes, or raw session storage.

Official references:

- Google Workspace MX setup and Gmail activation: https://support.google.com/a/answer/6156494
- Google Workspace support: https://support.google.com/a/answer/1047213

### Gmail completion criteria

All of the following must be true before changing Gmail from `UNVERIFIED`:

- Probe A succeeds.
- Probe B succeeds with verified zero results.
- Probe C succeeds with a known positive result.
- The provider-status record is updated with the successful timestamps/evidence refs.

---

## 2. Outlook — verified fallback, not a Gmail substitute

Outlook search currently succeeds and can preserve opportunity-inbox coverage while Gmail is degraded. The core `resolveInboundCoverage()` contract explicitly records the distinction:

- Gmail primary remains `UNVERIFIED`.
- Outlook can become the `effectiveProvider` for that scan.
- overall coverage becomes `DEGRADED_VERIFIED_FALLBACK`, not `PRIMARY_VERIFIED`.

No Human Authority action is currently needed unless Outlook authentication expires. If it does, restore the Outlook connection and require a successful search before treating it as a verified fallback again.

---

## 3. Contra — expose the installed connector runtime

### Current state

The `Contra_` app is installed and its ChatGPT app-specific permission is currently configured to allow its available actions, but the Contra tool namespace is not exposed in this execution runtime. OpportunityOS therefore must not claim that this runtime can currently call Contra's read/write actions.

### Human steps

1. Open a ChatGPT/runtime surface where the installed `Contra_` connector is actually exposed as an available tool.
2. Perform a read-only job-feed query and capture the provider response/identifier as health evidence.
3. Perform an inbox/conversation read and capture evidence.
4. Prepare one application preview without submitting it.
5. Inspect the connector's final confirmation operation. If it requires explicit per-action confirmation, keep `submit_application = CONFIRMATION_REQUIRED`; do not bypass it with browser automation.
6. Repeat the same preview/confirmation inspection for client-message replies.

### Contra completion criteria

- authenticated opportunity read succeeds;
- authenticated inbox read succeeds;
- prepare/preview succeeds;
- final-write semantics are documented from the live connector contract;
- any mandatory confirmation remains enforced by OpportunityOS;
- a provider/action receipt is generated for every actual write.

No live application needs to be submitted merely to prove connector health.

---

## 4. Freelancer — activate the governed official-API connector

### What has already been implemented

OpportunityOS now contains two intentionally separate adapters:

- `connectors/freelancer/freelancer_mcp_server.py` — existing public/read-only discovery adapter.
- `connectors/freelancer/freelancer_governed_mcp_server.py` — governed authenticated official-API adapter.

The governed adapter supports:

- public project/profile reads through the existing adapter;
- local deterministic bid preparation;
- package hashing and idempotency keys;
- mandatory written-permission gate;
- mandatory OAuth access-token gate;
- mandatory `canon:approval:` authority reference for provider writes;
- read-before-write duplicate-bid reconciliation;
- official API bid submission;
- authenticated thread listing;
- local deterministic message preparation;
- official thread-message submission;
- unknown-write-outcome handling that requires reconciliation before retry.

It intentionally does **not** automate project acceptance, milestone creation/release, payments, or other financial/contractual actions. Attachment upload is also intentionally not enabled yet.

### Why written permission is mandatory

Freelancer's current User Agreement, section 33, states that automated means—including API access—may not access the Website without Freelancer's express written permission. The API Terms also apply to API usage.

Official references:

- Freelancer User Agreement: https://www.freelancer.com/about/terms
- Freelancer API Terms: https://www.freelancer.com/about/apiterms

### Human steps

1. Obtain or locate Freelancer's **express written permission** for this automated API use case. Preserve that approval as evidence in Canon.
2. Create or confirm the Freelancer developer/OAuth application and exact redirect URI used by your connector deployment.
3. Complete OAuth authorization for the Freelancer account.
4. Store the resulting access token in the runtime secret store as:

`FREELANCER_ACCESS_TOKEN`

Never paste the token into Canon, Git, application packages, logs, receipts, or chat documentation.

5. Only after written permission has been verified, configure:

`FREELANCER_AUTOMATION_PERMISSION_CONFIRMED=true`

This flag is deliberately false by default. A valid token alone must never turn it on.

6. Start the governed connector:

`python connectors/freelancer/freelancer_governed_mcp_server.py`

7. Query `freelancer_governed_connector_status`. The expected readiness indicators are:

- `access_token_configured = true`
- `automation_permission_confirmed = true`
- `bid_submission = true`
- `thread_read = true`
- `messaging = true`
- `financial_actions = false`

8. Run an authenticated `list_freelancer_threads` read. A successful official API response is the first live connector-health proof.
9. Do **not** use a production bid as a health check. The first actual bid remains a consequential action and must carry the exact Human Authority policy/approval reference required by the Action Gateway.

### Freelancer completion criteria

- written-permission evidence exists in Canon;
- OAuth token is stored only in the secret store;
- permission flag is true only after step 1;
- governed connector status reports authenticated readiness;
- authenticated thread read succeeds;
- first production bid/message still passes package integrity, listing freshness, policy evaluation, Action Gateway authorization, and receipt verification.

---

## 5. Upwork — approved API only

### Current policy boundary

Upwork's current automation guidance says tools that automate interactions with Upwork can trigger restrictions and directs compliant integrations toward an approved API key. It also states that possession of an API key does not authorize automation outside the approved use case, and warns against using browser/session credentials in scripts.

Current API-key eligibility published by Upwork includes identity/profile/payment requirements, account good standing, at least $25,000 lifetime earnings/spend combined, and (for freelancers/agencies) Job Success Score of at least 90%. Upwork describes the API as personal/internal-use oriented and says there is no general third-party sandbox/test account.

Official references:

- Automation guidance: https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly
- API key request requirements: https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork

### Human steps

1. Review the current Upwork API-key eligibility requirements against the account.
2. If eligible, request an API key for the exact OpportunityOS **personal/internal** use case. Describe the intended read/write operations accurately.
3. Preserve Upwork's approval email/record and the exact approved use case/scopes in Canon.
4. Configure OAuth/API credentials only in the runtime secret store.
5. Provide OpportunityOS with the approved endpoint/scope inventory.
6. Enable only capabilities actually exposed by the approved API. Do not infer that proposal submission is permitted merely because job search is permitted.
7. If final proposal submission is not exposed or not approved, keep OpportunityOS in `PREPARE_ONLY` / `MANUAL_ONLY` for the final action.

### Upwork completion criteria

- approved API key exists;
- approved use case/scopes are recorded;
- a provider API health read succeeds;
- no session cookie/browser RPA fallback is configured;
- submission is enabled only if Upwork's approved API surface explicitly permits it.

---

## 6. Fiverr — prepare-only until Fiverr authorizes a machine-write surface

### Current policy boundary

Fiverr's January 2026 Terms prohibit unauthorized automation software/bots and automatic scraping/access to the Site. Fiverr's Community Standards also prohibit artificial/automated processes used for mass messaging.

Official references:

- Fiverr Terms of Service: https://www.fiverr.com/legal-portal/legal-terms/terms-of-service
- Fiverr Integrity and Authenticity standards: https://help.fiverr.com/hc/en-us/articles/37554436102289-Community-Standards-Integrity-and-Authenticity

### Human steps

1. Do not provide OpportunityOS with browser cookies, exported sessions, or a browser bot for Fiverr marketplace actions.
2. If Fiverr offers you an official account-authorized integration/API for the exact requested marketplace operation, preserve the provider documentation/approval in Canon.
3. Confirm the allowed read/write scope before changing `config/opportunity-provider-status.current.json`.
4. Until that evidence exists, use `prepareMarketplaceApplicationPackage()` for tailored, source-backed response preparation and perform the final Fiverr platform action manually.

### Fiverr completion criteria

Machine submission remains disabled unless an official/provider-approved interface explicitly permits the exact operation. Absence of an API is not permission to fall back to browser automation.

---

## 7. Human Authority — activate an auto-apply envelope

The repository contains the intentionally non-executable template:

`config/auto-apply-policy.human-authority.template.json`

Every threshold is deliberately `null`, the provider allowlist is empty, `status = DRAFT`, and `enabled = false`. OpportunityOS does not invent these policy decisions.

### Human steps

Populate every required field with your explicitly approved values:

- `authorityRef` — immutable Canon approval record for this exact envelope;
- `allowedProviders` — providers allowed for unattended submission;
- `minimumCompensationCents` — minimum accepted compensation in integer cents;
- `minimumSkillFit` — 0..1;
- `minimumWinProbability` — 0..1;
- `minimumCandidacyConfidence` — 0..1;
- `maximumApplicationCostCents` — maximum approved application cost in integer cents;
- `dailySubmissionLimit` — total autonomous submission cap per day;
- `perPlatformDailyLimit` — autonomous submission cap per provider per day.

After reviewing those exact values, change:

- `status` from `DRAFT` to `AUTHORIZED`;
- `enabled` from `false` to `true`.

Any material policy change requires a new Human Authority approval reference. Do not reuse the prior `authorityRef` after changing a threshold, provider allowlist, cost ceiling, or submission limit.

### Activation verification

Run the policy through `materializeAutoApplyPolicyEnvelope()`.

Expected result only after all fields are complete and explicitly authorized:

`state = AUTHORIZED`

Anything missing must return:

`state = NOT_AUTHORIZED`

Even an authorized policy envelope does not override provider restrictions. A provider marked `CONFIRMATION_REQUIRED`, `PERMISSION_REQUIRED`, `MANUAL_ONLY`, or `PROHIBITED` remains gated at the connector/action layer.

---

## 8. Required evidence to return to Canon

For each provider gate you complete, record only non-secret evidence:

| Evidence | Store in Canon? | Secret? |
| --- | --- | --- |
| provider approval email/reference | Yes | No, unless it embeds credentials |
| API/client application ID | Prefer opaque credential reference rather than raw value | Treat cautiously |
| OAuth access/refresh token | **No** | **Yes** |
| browser cookies/session storage | **No** | **Yes** |
| successful health-check timestamp | Yes | No |
| approved scopes/use-case summary | Yes | No |
| provider submission/thread identifier | Yes | No |
| application amount/credits committed | Yes | No |
| action receipt/hash | Yes | No |

The Credential Broker/runtime secret store holds credentials. Canon holds policy, provenance, evidence references, capability state, and action receipts.

---

## 9. Final operator acceptance checklist

The external-gate repair is complete when:

- Gmail passes all three controlled searches **or** remains explicitly `UNVERIFIED` with Outlook recorded as the verified fallback.
- Contra's live namespace is accessible and its actual confirmation semantics are recorded.
- Freelancer has documented written permission + OAuth secret + successful authenticated read before any write is enabled.
- Upwork has an approved API key/use case before any automated access or write is enabled.
- Fiverr remains manual unless an explicit Fiverr-approved machine interface is documented.
- the Human Authority auto-apply template is either intentionally `DRAFT` or has a new immutable Canon approval reference for every populated policy field.
- no connector claims `SUCCESS` without provider-backed post-action verification and a canonical receipt.
