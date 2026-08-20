# OpportunityOS Hybrid Discovery and Governed Application Execution

Status date: 2026-08-20

This document defines the reusable discovery and application layer for OpportunityOS. It preserves the AOC invariant:

`SOURCE -> FACT -> POLICY -> AUTHORITY -> ACTION -> VERIFICATION -> RECEIPT`

It does not grant new authority. Provider writes remain bounded by Human Authority policy, platform rules, connector capabilities, payload-bound authorization, and receipt capture.

## 1. Design objectives

1. Prefer an official provider API whenever it is available, approved for the account/use case, and sufficient for the requested operation.
2. Prefer an already-approved authenticated connector when it safely exposes the operation but the raw API is not directly integrated.
3. Use governed browser execution only when the provider permits automation and the API/connector does not cover the operation.
4. Never turn a failed read into a negative fact. Search failure is `UNVERIFIED`, not `NO_MATCH`.
5. Normalize opportunity, message, execution, health, and receipt records before downstream intelligence.
6. Keep credentials and session secrets out of opportunity records, prompts, logs, and receipts. Store only opaque credential/session references.
7. Separate discovery eligibility from autonomous-action eligibility. A plausible opportunity may be surfaced while still being ineligible for auto-apply.
8. Make retries bounded and idempotent. Never blindly retry an application submission whose outcome is unknown.
9. Preserve source provenance and provider identifiers on every normalized record.
10. Fail closed on provider policy ambiguity, unsupported claims, financial commitments, unclear eligibility, schema drift, expired authentication, or uncertain write outcome.

## 2. Shared execution architecture

The platform-specific adapter is deliberately thin. Every provider implements the same ports and returns the same envelopes.

```text
Provider
  -> Source Adapter
  -> Authentication / Session Broker
  -> Health Probe
  -> Normalizer
  -> Canonical Opportunity / Message Ledger
  -> Qualification + Pursuit Tier
  -> Application Package Builder
  -> Policy Envelope Evaluator
  -> Connector Router
       1. OFFICIAL_API
       2. APPROVED_CONNECTOR
       3. GOVERNED_BROWSER (only when permitted)
       4. MANUAL_ONLY
  -> Action Gateway
  -> Provider
  -> Independent Verification
  -> Action Receipt
  -> Canonical Ledger / Canon receipt chain
```

The core intelligence layer remains pure and cannot perform network/provider writes. `packages/core/src/opportunity-pipeline-policy.ts` owns the provider-neutral classifications. Actual provider writes belong in connector/runtime adapters behind the Action Gateway.

### 2.1 Provider adapter contract

Each adapter publishes a versioned capability manifest with at least:

- `provider`
- `adapterVersion`
- `transport`: official API, approved connector, governed browser, or manual
- `authenticationMode`: OAuth2, API token, platform session, or connector-managed
- `capabilities`: opportunity discovery, inbox read, application preparation, file upload, application submit, invitation response, message reply
- per-capability mode: `SUPPORTED`, `PREPARE_ONLY`, `CONFIRMATION_REQUIRED`, `UNAVAILABLE`, or `PROHIBITED`
- `browserAutomationPermitted`
- `financialActionPossible`
- `idempotencyStrategy`
- `healthState`
- `policyEvidenceRefs`
- `lastVerifiedAt`

A provider adapter may add provider-specific fields internally, but those fields cannot leak into downstream logic as hidden prerequisites.

### 2.2 Canonical read records

Opportunity discovery continues to use `MarketplaceOpportunityEvidence` for source-backed marketplace records. The same normalization principle applies to inbox events:

```text
InboundMessageEvent
- provider
- providerMessageId
- threadId
- senderIdentity
- receivedAt
- subjectOrContext
- normalizedText
- attachmentRefs[]
- sourceUrl
- retrievedAt
- retrievalMethod
- verified
- provenanceRefs[]
```

Secrets, OAuth tokens, cookies, MFA material, payment credentials, and raw browser storage are prohibited fields.

### 2.3 Canonical execution request

```text
ApplicationExecutionRequest
- opportunityId
- provider
- providerOpportunityId
- listingFingerprint
- policyId
- actionIntentId
- packageHash
- proposalTextHash
- attachmentHashes[]
- compensationSnapshot
- locationSnapshot
- candidacySnapshot
- applicationCostSnapshot
- connectorRoute
- authorityRef
- evidenceRefs[]
```

The request is immutable after authorization. Any change to proposal text, attachments, compensation, cost, target listing, or material answer invalidates the action hash and requires reevaluation.

### 2.4 Action receipt

Every external attempt records:

```text
ProviderActionReceipt
- receiptId
- actionIntentId
- opportunityId
- provider
- connectorRoute
- adapterVersion
- startedAt
- completedAt
- outcome: SUCCESS | VERIFIED_NOOP | FAILED | UNKNOWN_OUTCOME | ESCALATED
- providerSubmissionId | null
- providerThreadId | null
- amountCommittedCents
- creditsCommitted
- responseFingerprint | null
- verificationMethod
- evidenceRefs[]
- previousReceiptHash | null
- receiptHash
```

A submission is not recorded as successful merely because a click or HTTP request was issued. Success requires a provider-backed confirmation identifier, observable application state, or another deterministic verification method.

## 3. Health and error semantics

Every connector health probe emits one of:

- `HEALTHY`: authenticated operation and required provider surface verified.
- `DEGRADED`: reads or writes work only partially; coverage is explicit.
- `AUTH_REQUIRED`: authentication/session expired or missing.
- `PERMISSION_REQUIRED`: provider/account approval is missing for the requested capability.
- `RATE_LIMITED`: provider throttled the adapter.
- `SCHEMA_DRIFT`: API or DOM contract no longer matches the verified adapter.
- `UPSTREAM_UNAVAILABLE`: provider/network failure.
- `POLICY_PROHIBITED`: provider policy forbids the intended automation route.
- `UNVERIFIED`: the source cannot currently prove a reliable state.

### Retry matrix

| Error class | Automatic retry | Behavior |
| --- | --- | --- |
| transient network / 5xx | Yes, bounded | exponential backoff + jitter; max attempts per adapter policy |
| rate limited | Yes, bounded | honor provider reset / `Retry-After`; no busy polling |
| auth required | No blind retry | refresh through Credential Broker if an approved refresh flow exists; otherwise escalate |
| permission required | No | escalate to Human Authority/provider approval path |
| invalid input | No | repair package locally, then reevaluate policy |
| schema drift | No write retry | disable affected capability, capture evidence, require adapter repair |
| policy prohibited | Never | route to manual or approved API only |
| confirmation required | Never unattended | prepare preview and request required Human Authority confirmation |
| unknown submit outcome | Never blind retry | query provider for existing submission first; only retry after duplicate-safe proof |

All write requests carry an idempotency key derived from provider, target opportunity, listing fingerprint, package hash, and action intent. If the provider has a native idempotency mechanism, use it. If not, perform a read-before-write and read-after-write reconciliation around the provider's stable identifiers.

## 4. Gmail repair and verifiable inbound search

### 4.1 Live diagnosis on 2026-08-20

The connected Gmail identity resolves successfully for `nicholas@fullstackassets.com`, but both message search and label-list operations return the same Google `failedPrecondition` failure. Because a non-search mailbox operation fails identically, this is not treated as a malformed Gmail search query. ChatGPT's Gmail app permission is already configured to allow its available actions.

The local pipeline repair is therefore to preserve the provider failure explicitly while the Google mailbox/data-plane precondition is repaired externally. Google documents `users.messages.list` as a mailbox-list operation, and its current API error guide treats 400-class errors as client/precondition failures. Current Google community reports also show `FAILED_PRECONDITION` affecting some Gmail API accounts even when OAuth is otherwise valid.

### 4.2 Required mailbox-side repair gate

Before Gmail can become `VERIFIED`, confirm the authenticated Google identity has an active Gmail mailbox:

1. Open Gmail directly for the same Google identity and confirm the mailbox itself loads.
2. For Google Workspace, confirm Gmail service access and the appropriate Workspace/Gmail entitlement are enabled for the user.
3. If the identity is only a Google Account associated with an externally hosted address and has no Gmail mailbox, provision a Gmail-capable mailbox or connect the actual mailbox provider instead. A Google identity alone is not equivalent to a working Gmail mailbox.
4. Reauthorize the Gmail connector only after mailbox service is known to be active, then repeat the controlled probes below.
5. If direct Gmail works but the API still produces the same mailbox-level `FAILED_PRECONDITION`, preserve `UNVERIFIED` and escalate as a Google-side API/account issue rather than changing queries or reporting zero inbound.

### 4.3 Controlled validation protocol

A Gmail repair is complete only after all three states are proven through live provider responses:

**Probe A: endpoint/search health**

Run a broad, harmless mailbox search such as a recent `in:anywhere` query. Any successful response proves the search endpoint is callable; zero results are acceptable for this health probe.

**Probe B: verified negative**

Search for a generated impossible sentinel, for example a long unique subject token that has never been sent. A successful response with zero IDs maps to `NO_MATCHING_INBOUND_ACTIVITY`.

**Probe C: verified positive**

Use a known message or send a controlled sentinel into the mailbox through an authorized path, then search for its exact stable token. A successful response containing the message maps to `NEW_INBOUND_ACTIVITY`.

Any provider/API failure in A, B, or C maps to `UNVERIFIED`, including `FAILED_PRECONDITION`, auth errors, timeouts, rate limits, or schema failures. A failure can never map to `NO_MATCHING_INBOUND_ACTIVITY`.

`classifyInboundSearch()` in the core enforces this distinction and is covered by behavioral tests.

## 5. Marketplace write paths

Platform policy can change. Capability manifests must therefore include policy evidence and a verification date; policy is runtime data, not a timeless hard-coded assumption.

### 5.1 Contra

**Current state:** authenticated approved connector is live. Job feed and chat inbox reads work. The connector exposes preview/prepare and confirm operations for applications and messages.

**Write boundary:** the current connector contract explicitly requires an application/message preview followed by explicit user approval before the confirmation call. Therefore:

- discovery: `SUPPORTED`
- inbox read: `SUPPORTED`
- prepare tailored application: `SUPPORTED`
- prepare message: `SUPPORTED`
- upload/attach portfolio evidence: supported where the connector operation accepts it
- submit application: `CONFIRMATION_REQUIRED`
- send message: `CONFIRMATION_REQUIRED`
- unattended auto-submit: not currently permitted by the connector contract

**Shortest path:** use the existing authenticated connector immediately for reads and prepare flows. Do not replace it with browser automation. To support unattended auto-submit in the future, the connector/provider contract itself must expose a policy-compatible pre-authorized write mechanism; OpportunityOS must not bypass the current confirmation requirement.

### 5.2 Freelancer.com

**Current repo state:** an official-API-based read-only MCP adapter already exists. It retrieves active projects and profiles, builds an OAuth authorization URL, and intentionally reports bid/message writes as unavailable.

Freelancer's official Python SDK documents project bidding and messaging operations, including creating bids, starting project threads, sending messages, and uploading message attachments. Freelancer's User Agreement also says automated access, including API access, requires express written permission, while its API Terms govern permitted API use.

**Shortest compliant write path:** 

1. Obtain/verify Freelancer permission for this automated use case and a valid OAuth access token.
2. Extend the existing adapter using documented official API/SDK operations, not browser scraping.
3. Add `prepare_bid` as a pure package/validation operation.
4. Add `submit_bid` only behind Action Gateway authorization, current-project revalidation, duplicate-bid reconciliation, budget/period validation, and receipt capture.
5. Add thread/message retrieval and `prepare_message` / `send_message` with the same policy boundary.
6. Add attachment upload only through official API support and hash the attachment into the action intent.
7. Keep milestones, payments, award/acceptance, and any other financial/contractual actions outside the auto-apply envelope unless separately authorized.

Until step 1 is evidenced, writes remain `PERMISSION_REQUIRED` / `PREPARE_ONLY` even though the upstream API is technically capable.

### 5.3 Upwork

Upwork's current guidance classifies scripts, browser extensions, and third-party automation that automatically sends requests or collects data as automation. It directs compliant automation to an approved Upwork API key and warns that even an API key is limited to the approved use case. Current API-key eligibility includes account/profile/payment/identity and performance requirements, and the API is for personal/internal use.

**Shortest compliant path:** 

1. Determine whether the account meets Upwork's current API-key eligibility requirements.
2. Request an API key with the exact personal/internal OpportunityOS use case.
3. Use OAuth 2.0 and only the operations/scopes explicitly approved for that key.
4. Build read/write capabilities only for endpoints included in the approved API surface and use case.
5. If proposal submission is not exposed/approved for the account, keep proposal preparation and field mapping in OpportunityOS but route final submission to `MANUAL_ONLY`.

**Hard routing rule:** do not use browser/RPA fallback on Upwork to work around missing API coverage. The current platform guidance explicitly treats unapproved browser automation as prohibited and potentially account-restricting.

### 5.4 Fiverr

The current OpportunityOS Fiverr adapter is intentionally a lower-trust public seller-service-listing adapter. It does not represent buyer opportunities and does not use authenticated sessions. Fiverr's January 2026 Terms prohibit unauthorized automation software and automated scraping/access to the Site; Community Standards separately prohibit abusive automated messaging.

**Shortest compliant path:** 

1. Keep the existing public adapter for competitive/supply intelligence only; do not relabel seller listings as buyer demand.
2. Use a Fiverr-provided, account-authorized integration only if Fiverr exposes a seller/buyer communication or marketplace workflow intended for this use case.
3. Until such an approved interface exists for the needed operation, OpportunityOS may prepare response/application content from a user-supplied or connector-supplied request but final platform writes remain `MANUAL_ONLY`.
4. Do not create an authenticated browser bot, bypass anti-bot controls, export session cookies, or use browser automation to simulate seller actions under the current terms.

## 6. Broadened discovery tiers

Discovery must distinguish "not proven" from "proven ineligible." Hard exclusions remain narrow and evidence-backed:

- fraudulent/scam or prohibited opportunity
- explicitly unpaid work
- demonstrably disallowed work location / attendance requirement
- verified legal/work-authorization incompatibility
- verified mandatory credential the candidate does not hold
- closed/deleted/non-current listing
- platform policy prohibits the pursuit method

Everything else is rankable uncertainty.

`classifyPursuitTier()` exposes:

1. `STRONG_MATCH`: high winability and high confidence with verified eligibility.
2. `REALISTIC_CANDIDATE`: credible chance, including adjacent or partial evidence where no hard exclusion exists.
3. `MODERATE_PLAUSIBLE`: lower but non-trivial modeled chance.
4. `REQUIRES_CLARIFICATION`: a material location/credential/compensation/eligibility fact must be resolved.
5. `MONITORING_ONLY`: weak or low-confidence candidate worth retaining for future evidence/change.
6. `EXCLUDED`: only hard, source-backed disqualifiers.

Unknown evidence must lower confidence or create a clarification task. It must not silently become a hard rejection.

## 7. Governed auto-apply

Auto-apply is two separate decisions:

1. **Policy eligibility:** `evaluateAutoApply()` determines whether the opportunity is completely inside a Human Authority-approved envelope.
2. **Action execution:** the Action Gateway authorizes an exact immutable package and an authorized connector performs the write.

A candidate can return `AUTO_SUBMIT` from policy evaluation only when all of these are true:

- listing is current
- listing has not already been pursued
- provider is allowed by the policy
- compensation is confirmed and meets the configured minimum
- location is confirmed allowed
- skill fit, modeled win probability, and candidacy confidence meet configured thresholds
- application cost is within the approved maximum
- no unsupported application claims exist
- no required clarification remains
- evidence refs exist for the package
- connector supports submission
- platform does not require a per-action confirmation that overrides the policy envelope
- daily and per-platform submission limits have not been reached
- the Human Authority policy envelope is enabled and verified

Decision meanings:

- `AUTO_SUBMIT`: inside the envelope; may proceed to Action Gateway. Not proof that a provider write occurred.
- `PREPARE_ONLY`: useful candidate, but connector/policy/threshold/limit prevents autonomous submission.
- `ESCALATE`: ambiguity, unsupported claim, cost, location/compensation uncertainty, or required platform confirmation needs Human Authority.
- `DENY`: stale/duplicate/hard outside-envelope opportunity for auto-apply.

### Application package validation

Before Action Gateway admission:

- all required provider fields present
- claims resolve to Canon/verified resume/portfolio evidence
- degree, employment length, credentials, revenue, customer, production scale, and similar claims cannot be inferred
- proposal is tailored to the source listing
- required attachments exist, are readable, and match expected hashes
- compensation and location answers match source facts
- no answer conflicts with another application field
- current listing fingerprint matches the one used during package generation
- cost/Connects/bid credits are re-read immediately before submission when the platform uses variable application costs

A material drift restarts policy evaluation.

## 8. Implementation phases

### Phase 0: Canon and contracts

**Implemented in this branch:** provider-neutral tri-state inbound search, broadened pursuit tiers, connector route selection, and pure auto-apply policy evaluation.

Completion criteria:

- behavioral tests prove failed reads cannot become negative facts
- uncertain candidacy can be surfaced without weakening hard exclusions
- browser fallback cannot be selected when platform policy says no
- auto-apply cannot return `AUTO_SUBMIT` outside a verified policy envelope

### Phase 1: Capability registry and execution envelope

Implement a provider capability registry consumed by the connector router. Add canonical execution-request and provider-action-receipt schemas, stable idempotency keys, and append-only receipt persistence.

Dependencies: Canon policy registry, Action Gateway, Credential Broker, canonical opportunity ledger, attachment/object storage.

Completion criteria: the same execution request can be routed to API/connector/browser/manual without changing downstream OpportunityOS logic.

### Phase 2: Gmail/search health

Repair the external Gmail mailbox precondition, then run Probe A/B/C. Persist source-health receipts and expose `NEW_INBOUND_ACTIVITY`, `NO_MATCHING_INBOUND_ACTIVITY`, or `UNVERIFIED` only.

Completion criteria: three live controlled probes succeed and a forced/observed failure remains `UNVERIFIED`.

### Phase 3: Marketplace read coverage

- Contra: use live connector for feed/inbox.
- Freelancer: deploy existing official API adapter with authorized OAuth.
- Upwork: integrate only after approved API key/use case.
- Fiverr: retain seller-supply intelligence; add buyer-demand read only through an authorized Fiverr surface if one becomes available.

Completion criteria: source health, authentication state, provenance, dedupe, and normalized records are verified independently for each enabled source.

### Phase 4: Write-capable connectors

Add write operations only where provider policy and account authorization support them. Every provider write follows prepare -> validate -> authorize -> submit -> verify -> receipt.

Completion criteria per provider:

- authenticated read succeeds
- prepare path is deterministic
- attachments hash/verify
- invalid claims fail closed
- duplicate submission test passes
- forced network failure produces no false success receipt
- provider confirmation is independently observed
- cost/credits are recorded
- policy-prohibited browser path has a negative test

### Phase 5: Governed browser worker

Build only for providers/operations that explicitly permit it. Use a durable isolated browser session reference, allowlisted domains/actions, DOM-contract versioning, screenshot/evidence capture, bounded navigation, and no credential exfiltration.

Completion criteria: browser worker cannot run for a manifest marked `browserAutomationPermitted: false`, cannot submit without Action Gateway authorization, and fails closed on DOM drift or unknown outcome.

### Phase 6: Auto-apply rollout

Roll out in four modes:

1. `OBSERVE`: score/tier only.
2. `PREPARE`: build packages, no provider writes.
3. `CONFIRM`: connector writes only after per-action Human Authority confirmation.
4. `AUTO`: only operations fully inside an approved persistent policy envelope and permitted by the provider/connector contract.

Completion criteria: shadow-mode false-positive review passes, canary submissions produce complete receipts, no duplicate submits, no unsupported claims, no unapproved spending, and kill switch stops writes immediately.

## 9. Definition of done

The pipeline is operational rather than merely designed when all of the following are true:

- Gmail has passed live positive, negative, and failure-state validation.
- Every enabled source exposes a versioned health state and capability manifest.
- Reads normalize into the canonical opportunity/message models with provenance.
- At least one provider can complete prepare -> authorize -> submit -> verify -> receipt through an approved write connector.
- Provider policies are encoded as routing constraints and have current evidence refs.
- Browser automation is impossible when the provider manifest forbids it.
- Discovery outputs the six pursuit tiers rather than treating uncertainty as rejection.
- Auto-apply policy is enabled only through Human Authority and cannot self-expand its provider, spend, compensation, geography, claim, or submission-limit boundaries.
- Every successful external write has an independently verifiable provider identifier/state and an append-only receipt.
- CI covers success, no-match, auth failure, policy prohibition, schema drift, rate limit, duplicate, unknown outcome, unsupported claim, cost escalation, stale listing, and connector confirmation cases.

## 10. Current external policy references

- Google Gmail API error handling and `users.messages.list`: `developers.google.com/workspace/gmail/api/guides/handle-errors` and `developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list`.
- Upwork automation/API guidance: `support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly`, API-key eligibility, and OAuth documentation.
- Freelancer User Agreement/API Terms: `freelancer.com/about/terms`, `freelancer.com/about/apiterms`; official SDK: `github.com/freelancer/freelancer-sdk-python`.
- Fiverr Terms of Service/Community Standards: `fiverr.com/legal-portal/legal-terms/terms-of-service` and current Help Center Community Standards.

These references are evidence for routing policy as of the status date, not permanent assumptions. Revalidate them before enabling a new automated write capability.
