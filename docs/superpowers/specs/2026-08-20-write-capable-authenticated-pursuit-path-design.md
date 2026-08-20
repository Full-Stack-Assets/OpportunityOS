# Write-Capable Authenticated Pursuit Path Design

Date: 2026-08-20
Status: Approved design, pending implementation plan
Repository: `Full-Stack-Assets/OpportunityOS`

## 1. Purpose

OpportunityOS needs a reusable authenticated write path that can submit job applications, marketplace proposals, and related pursuit actions across external platforms without weakening the existing evidence, authorization, and receipt model.

The system will use official authenticated APIs when they are available, sufficient, and permitted. When an official write API is unavailable or insufficient, it may use browser-assisted authenticated execution. Browser automation is a substitute for manual form interaction only. It must not bypass CAPTCHA, MFA, account recovery, anti-bot controls, or platform security requirements.

The design preserves the core invariant:

`SOURCE -> FACT -> POLICY -> APPROVAL -> ACTION -> VERIFICATION -> RECEIPT`

Preparing an application is not submission. Triggering a write is not proof of submission. Only independent post-action evidence may produce a verified submitted state.

## 2. Existing boundaries to preserve

### 2.1 Read adapters remain read-oriented

The existing Freelancer connector is intentionally read-only and currently exposes project search, public profile retrieval, OAuth authorization URL generation, and connector status. It must remain a source/evidence adapter rather than becoming an unrestricted account-control surface.

Write capability belongs behind a separate pursuit-execution boundary.

### 2.2 Trust Kernel remains authoritative

The existing `packages/core/src/trust-kernel.ts` provides canonical payload hashing, payload-bound approvals, approval expiry, signature verification, and chained receipts. The new execution layer must reuse those primitives rather than create a second authorization model.

### 2.3 Simulation remains valid

The current release explicitly treats live external actions as disabled. Adding live pursuit capability must not silently change simulation semantics or existing tests.

## 3. Architectural decision

### Chosen approach

Use a hybrid API + browser architecture behind a common Action Gateway:

`Opportunity -> Qualified Pursuit -> PreparedApplication -> PolicyCheck -> AuthorizedAction -> PursuitExecutor -> IndependentVerification -> SubmissionReceipt`

Official authenticated APIs are preferred. Browser-assisted execution is a controlled fallback.

### Rejected alternatives

1. **Mix reads and writes inside every source connector.** Rejected because it blurs the source-fact boundary and increases the chance that discovery code acquires side effects.
2. **Use one browser bot for all platforms.** Rejected because it discards official API advantages, weakens evidence quality, and makes provider-specific semantics harder to maintain.

## 4. Execution modes

Add three explicit execution modes:

```ts
export type ExecutionMode =
  | 'SIMULATION'
  | 'LIVE_INSPECT'
  | 'LIVE_AUTHORIZED';
```

### `SIMULATION`

No live authentication or external write is required. Existing release behavior remains intact.

### `LIVE_INSPECT`

The system may authenticate, verify account identity, open live application forms, inspect current requirements, estimate costs or credits, validate session health, and prepare upload mappings. It must not submit, bid, message, publish, accept a contract, purchase credits, or perform another consequential write.

### `LIVE_AUTHORIZED`

The system may perform only the specifically authorized action whose payload still matches the validated live requirements.

## 5. Canonical application compiler

Platform-specific executors must not invent application content. A canonical compiler produces a complete, evidence-aware `PreparedApplication` first.

```ts
export interface PreparedApplication {
  opportunityId: string;
  pursuitId: string;
  targetPlatform: string;
  targetUrl: string;
  applicantIdentityRef: string;

  resumeArtifactRef?: string;
  coverLetter?: string;
  proposalText?: string;

  answers: PreparedAnswer[];
  portfolioRefs: string[];
  compensationExpectation?: string;
  availability?: string;
  location?: string;
  workAuthorizationStatus?: string;

  expectedCost: {
    currency?: string;
    amount?: number;
    credits?: number;
    requiresPurchase: boolean;
  };

  requiredUploads: string[];
  payloadHash: string;
  preparedAt: string;
  expiresAt: string;
}

export interface PreparedAnswer {
  fieldKey: string;
  prompt: string;
  answer?: string | boolean | number;
  sourceOfTruthRef?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceClass:
    | 'VERIFIED_FACT'
    | 'USER_ATTESTED_FACT'
    | 'DERIVED_NONCONSEQUENTIAL'
    | 'PROPOSED_WORK'
    | 'UNRESOLVED'
    | 'PROHIBITED_TO_INFER';
  attestationClass:
    | 'ORDINARY'
    | 'COMPENSATION'
    | 'AVAILABILITY'
    | 'LEGAL'
    | 'DEMOGRAPHIC_EEO'
    | 'BACKGROUND_CHECK'
    | 'RELOCATION_TRAVEL'
    | 'PUBLICATION_VIDEO_WORK_SAMPLE';
}
```

### Evidence rules

- Verified portfolio links, project facts, current enrollment, and known contact data may be `VERIFIED_FACT`.
- Availability, preferred rate, work authorization, sponsorship status, legal attestations, and similar user-dependent facts must not be guessed.
- Proposed implementation approaches must be marked `PROPOSED_WORK`, not represented as prior experience.
- Unsupported professional years, framework depth, customer results, deployment status, or degree claims are rejected.
- `UNRESOLVED` and `PROHIBITED_TO_INFER` fields block submission when the live form requires them.

## 6. Live form inspection and requirement diffing

Before any write, the executor must inspect the live destination.

```ts
export interface PursuitExecutor {
  inspect(target: PursuitTarget): Promise<FormSchema>;
  validate(
    application: PreparedApplication,
    form: FormSchema,
  ): Promise<ValidationResult>;
  execute(
    action: AuthorizedPursuitAction,
  ): Promise<ExecutionResult>;
  verify(
    execution: ExecutionResult,
  ): Promise<VerificationResult>;
}
```

The required sequence is:

`prepare -> inspect live form -> diff requirements -> revalidate payload -> authorize -> execute -> verify`

If a form changes after preparation, the executor must not improvise. It returns `PAYLOAD_CHANGED`, `NEEDS_INPUT`, or another explicit fail-closed state.

## 7. Credential Broker

The Credential Broker owns API credentials and OAuth tokens. Agents and application payloads receive only opaque references.

Example:

`credentialRef: freelancer:nicholas:primary`

The broker may store metadata such as:

```text
platform
account_id
account_email_or_username
credential_type
scopes
created_at
last_verified_at
expires_at
status
allowed_actions
```

It must never expose raw access tokens, refresh tokens, client secrets, passwords, MFA material, or session cookies through application payloads, logs, receipts, model-visible context, or source control.

Authentication proves identity, not authority. Every requested write must still pass policy and authorization.

## 8. Session Broker

The Session Broker owns persistent authenticated browser sessions for platforms that require browser-assisted writes.

Example:

`sessionRef: upwork:nicholas:primary`

The preferred implementation uses isolated persistent Playwright browser contexts or an equivalent browser automation runtime with encrypted session storage.

Before every write, the session layer must verify:

1. expected platform,
2. expected account identity,
3. session health,
4. allowed action scope,
5. no unexpected authentication challenge.

The browser path must stop on:

- CAPTCHA or anti-bot challenge,
- MFA, passkey, or security-key prompt,
- password reset or account recovery,
- unexpected login challenge,
- account identity mismatch,
- changed legal or consequential attestation,
- unexpected paid requirement,
- changed application requirements that invalidate the approved payload.

There will be no CAPTCHA solver, MFA relay, stealth bypass, fingerprint spoofing, or automated account-recovery mechanism.

## 9. Action Gateway

The Action Gateway receives an exact payload-bound intent, not a vague command such as "apply to this job."

A pursuit action payload must include, at minimum:

- opportunity ID,
- pursuit ID,
- target platform and target URL,
- applicant identity reference,
- exact compiled application payload hash,
- resume and attachment artifact references,
- expected monetary or credit cost,
- execution route,
- credential or session reference,
- expiry,
- sender identity when email is involved.

The gateway must reuse `authorizeAction()` from the Trust Kernel or an extension that preserves the same canonical-hash and expiry semantics.

The executor cannot expand approval by inference.

## 10. Allowed and denied action scopes

Authentication records carry explicit action scopes.

Examples of allowed pursuit scopes:

- `submit_bid`
- `submit_application`
- `fill_application`
- `upload_resume`
- `send_pursuit_email`

Examples that must be denied by default:

- `purchase_connects`
- `purchase_bid_credits`
- `release_milestone`
- `withdraw_funds`
- `change_payout_method`
- `change_account_security`
- `accept_contract`
- `sign_legal_agreement`
- `change_public_profile`

A valid session or token does not broaden these scopes.

## 11. Cost controls

Every live write must classify cost before execution.

- Free application routes may proceed when otherwise authorized.
- Existing marketplace credits may be consumed only when policy explicitly permits it and no new purchase is required.
- Any new monetary purchase, subscription, connect/bid-token purchase, or unexpected charge halts with `COST_CHANGED` or `NEEDS_HUMAN_AUTH`.
- If the live form shows a different cost from the prepared payload, the prior authorization is invalidated.

## 12. Browser field classification

Live form fields should be normalized into semantic classes before values are supplied:

- profile/contact,
- portfolio/work history,
- screening answer,
- compensation,
- availability,
- work authorization/legal,
- demographic/EEO,
- background-check consent,
- relocation/travel,
- paid-credit/bid requirement,
- video/public-post/work-sample requirement.

This classification determines whether the current policy may supply the answer automatically or must stop for Human Authority.

## 13. Executor selection

The execution router uses this order:

1. official authenticated API when a supported write endpoint, required scopes, and acceptable platform terms are verified,
2. authenticated browser execution when the API is unavailable or insufficient,
3. `UNAVAILABLE` when neither route is valid.

The router must not assume a write API exists merely because a read API exists. Each platform receives a capability probe and health status.

## 14. Initial platform strategy

### 14.1 Freelancer

Keep the current read-only source connector intact.

Add a separate Freelancer pursuit executor. During implementation, verify the official authenticated API's current write endpoints and OAuth scopes. If authenticated bid submission is officially supported and permitted, implement that API route first. If not, use the generic browser executor for Freelancer rather than undocumented or private API calls.

### 14.2 Generic ATS browser executor

Build a generic browser executor capable of inspecting and interacting with common structured job-application forms. Initial provider-specific modules may cover systems such as Ashby, Lever, Greenhouse-style forms, and similar ATS flows where ordinary browser submission is supported.

Provider modules should map DOM/form semantics into the common `FormSchema` contract rather than hard-code application content.

### 14.3 Upwork

Add an Upwork browser executor after the generic browser path, session broker, challenge detection, and verification model have passed canary tests. No attempt will be made to bypass Connects, anti-bot controls, or platform restrictions.

### 14.4 Fiverr and Contra

Use the same capability-probe model. Prefer official APIs when they provide the required account write. Otherwise use browser execution only where the platform permits normal authenticated user interaction and the system can verify submission safely.

### 14.5 Email pursuit executor

An email executor may be enabled only when the connected provider can verify and send from the required sender identity. For the current policy, outbound pursuit email must originate from `nicholas@fullstackassets.com`. If the connector cannot verify that sender identity, the email action must return `UNAVAILABLE_SENDER` rather than silently fall back to another account.

## 15. Idempotency and duplicate prevention

Each write receives an idempotency key derived from:

```text
platform
account identity
opportunity
application payload hash
action type
```

If an execution times out or returns an ambiguous result, the system must reconcile before retrying. It must not blindly click submit or send twice.

A second request with an identical idempotency key must return the previously verified result, an `ALREADY_SUBMITTED` result, or enter reconciliation.

## 16. Execution result states

Use explicit states:

```ts
export type PursuitExecutionStatus =
  | 'SUBMITTED_VERIFIED'
  | 'EXECUTED_UNVERIFIED'
  | 'ALREADY_SUBMITTED'
  | 'REJECTED_BY_PLATFORM'
  | 'NEEDS_HUMAN_AUTH'
  | 'AUTH_REQUIRED'
  | 'MFA_REQUIRED'
  | 'CAPTCHA_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_MISMATCH'
  | 'PAYLOAD_CHANGED'
  | 'COST_CHANGED'
  | 'UNAVAILABLE_SENDER'
  | 'UNAVAILABLE'
  | 'FAILED';
```

`EXECUTED_UNVERIFIED` is intentionally non-successful. It must not trigger an automatic retry until reconciliation determines whether the platform already recorded the action.

## 17. Independent verification

The executor may report what it attempted, but it cannot declare its own success.

A separate verifier establishes durable external evidence using one or more of:

- official API submission or bid ID,
- durable response containing a platform identifier,
- application visible in the user's platform dashboard,
- platform confirmation page bound to the correct opportunity/account,
- platform-generated confirmation email,
- externally observable pursuit-state transition,
- email provider `SENT` message ID from the required sender identity.

A browser screenshot may be retained as supporting evidence but is insufficient by itself when a stronger durable record is available.

## 18. Receipts

Every attempted external write creates a chained receipt using the existing receipt model.

A pursuit receipt records:

- action ID,
- opportunity and pursuit IDs,
- payload hash,
- approval reference,
- executor type (`api` or `browser`),
- platform/account identity reference,
- execution mode,
- timestamp,
- monetary or credit cost consumed,
- execution result,
- verifier result,
- durable platform submission ID when available,
- evidence references,
- prior receipt hash.

Receipts must never contain raw credentials, cookies, passwords, tokens, MFA material, or protected demographic answers.

## 19. Human Authority boundaries

The existing auto-apply policy may authorize ordinary application submissions only when all required material facts are already verified and no new consequential commitment is introduced.

The system must stop for Human Authority when an application requires any unresolved or newly consequential action, including:

- work-authorization or sponsorship facts not already verified,
- legal attestation,
- background-check consent,
- relocation or travel commitment,
- public post,
- video response,
- coding challenge or work trial,
- contract acceptance,
- paid purchase,
- new demographic/EEO decision where policy does not already define handling.

Human approval binds only the exact action and payload and cannot be broadened by inference.

## 20. Security requirements

- No secrets in Git.
- No raw credentials in canonical application objects.
- No raw credentials in receipts.
- Encrypted token and session storage.
- Per-platform and per-account action scopes.
- Least-privilege OAuth scopes where available.
- Account identity verification before every write.
- Session expiration and revocation handling.
- Structured log redaction for sensitive form values.
- Separate execution and verification responsibilities.
- Browser profile isolation between platforms/accounts.
- No security-control bypass behavior.

## 21. Testing strategy

### Unit tests

- application evidence classification,
- unresolved-field fail-closed behavior,
- payload hashing and mutation invalidation,
- action-scope denial,
- cost-change invalidation,
- idempotency-key stability,
- result-state transitions,
- receipt redaction.

### Contract tests

Each executor must pass a shared suite covering:

- live-form requirement mapping,
- changed-field detection,
- ordinary-field filling,
- prohibited-field blocking,
- challenge detection,
- duplicate prevention,
- verifier independence.

### Browser tests

Use local fixture forms and provider-specific test fixtures to simulate:

- normal application,
- new mandatory field,
- CAPTCHA page,
- MFA page,
- session expiry,
- wrong account,
- cost increase,
- timeout after submit,
- successful confirmation.

### Integration tests

Use real accounts only under `LIVE_INSPECT` until canary approval. No write test may be mislabeled as safe merely because it targets a low-value opportunity.

## 22. Rollout gates

### Gate A: live authentication, zero writes

- connect Freelancer OAuth or another approved API identity,
- create one persistent browser session,
- verify account identity,
- inspect real forms,
- perform no external write.

### Gate B: dry application compilation

- compile real `PreparedApplication` objects from Firehose opportunities,
- inspect live forms,
- prove unresolved/legal/cost fields halt correctly,
- prove payload changes invalidate stale authorization.

### Gate C: canary writes

Perform one deliberately selected human-approved write for each executor family being enabled, initially:

1. one API-family write if a compliant official write API is verified,
2. one generic ATS browser application.

Each canary requires independent external verification and a persisted receipt.

### Gate D: policy-governed auto-apply

Enable autonomous `LIVE_AUTHORIZED` execution only after Gate C passes and only for opportunities already covered by the explicit auto-apply policy.

## 23. Go-live acceptance criteria

The system is not considered write-capable and production-ready until all of the following are demonstrated:

- zero secret leakage in logs, database records, receipts, or errors,
- zero duplicate submissions under retry and timeout tests,
- CAPTCHA and MFA always halt,
- account identity mismatch always halts,
- changed form requirements invalidate or recompile the payload,
- unresolved legal facts never auto-populate,
- unexpected spend always halts,
- executor cannot self-verify,
- successful submission produces durable external evidence,
- receipts reconstruct exactly what was authorized and what actually occurred,
- simulation behavior and existing simulation tests remain intact,
- `LIVE_INSPECT` cannot submit,
- `LIVE_AUTHORIZED` cannot exceed the scoped authorization.

## 24. Non-goals

This design does not authorize or implement:

- CAPTCHA solving,
- MFA bypass,
- credential harvesting,
- undocumented private API abuse,
- stealth fingerprint evasion,
- automated account recovery,
- purchasing application credits without separate authority,
- contract acceptance or payment release,
- automatic invention of missing applicant facts,
- weakening the current source evidence boundary.

## 25. Expected implementation units

Implementation planning should decompose the work into serial units so no unit duplicates the Trust Kernel or existing source connectors:

1. canonical pursuit/application contracts and policy classifications,
2. Credential Broker and Session Broker interfaces,
3. Action Gateway extension and idempotency/reconciliation model,
4. generic executor and independent verifier contracts,
5. Freelancer capability probe plus first compliant executor route,
6. generic ATS browser executor with challenge detection,
7. persistent session management and secure storage adapter,
8. receipt integration and observability,
9. canary test harness and rollout controls,
10. later provider-specific adapters for Upwork, Fiverr, Contra, and email.

The implementation plan must preserve provider neutrality: platform-specific behavior belongs in thin adapters behind canonical pursuit, authority, evidence, and receipt contracts.
