# Shared Acquisition Fabric v1 — Design Specification

**Status:** Approved for planning  
**Date:** 2026-08-24  
**Canonical consumer:** `Full-Stack-Assets/OpportunityOS`  
**Target system:** separate shared Acquisition Fabric, provisionally `Full-Stack-Assets/AcquisitionFabric`  
**Goal:** Persist marketplace and account connections once, ingest source-backed opportunity activity continuously, maintain a canonical provenance-rich opportunity ledger, and let OpportunityOS autonomously pursue qualified work while interrupting the owner only for meaningful exceptions.

## 1. Decision Summary

OpportunityOS will no longer be responsible for owning every provider session, polling loop, cursor, and raw source record. Those concerns move into a separate shared Acquisition Fabric.

The resulting division of responsibility is:

```text
Acquisition Fabric
  connects + watches + verifies + remembers + deduplicates

OpportunityOS
  evaluates + prioritizes + prepares + pursues + learns
```

GPT, Grok, Manus, OpportunityOS, and future agents consume the same normalized records through authenticated shared interfaces. No individual model session owns the canonical provider credential, cursor, opportunity identity, or application history.

The user-facing behavior is:

```text
Observe continuously
  -> verify
  -> persist immutable source evidence
  -> deduplicate into a canonical opportunity
  -> score immediately
  -> autonomously pursue when policy allows
  -> notify only for substantive replies, blocked high-value pursuits, or required decisions
  -> record receipts and outcomes
```

## 2. Scope

### In scope for v1

- Persistent account/marketplace connections for Freelancer, Gmail, GitHub, Hacker News, Reddit, and Contra, subject to each provider's permitted authentication and retrieval surfaces.
- Integration with the Freelancer OAuth connection being built independently by the owner; this design does not replace or fork that work.
- Shared token lifecycle, connection health, scopes, capabilities, account identity, and reauthorization state.
- Managed continuous ingestion without requiring the owner to operate a personal always-on server.
- Provider-specific polling, webhook, push, or event-stream ingestion.
- Durable cursors, leases, retries, receipts, source health, and failure classification.
- Immutable raw observations plus a canonical opportunity ledger.
- Conservative and reversible deduplication with complete provenance.
- Cross-agent read access through MCP and/or an authenticated HTTP event/query API.
- OpportunityOS scoring, autonomous application policy, pursuit receipts, reply monitoring, and exception-only notification.
- Fail-closed behavior when source verification, authentication, policy, or action authority cannot be established.

### Explicitly out of scope for v1

- Accepting contracts or legal terms automatically.
- Creating, funding, releasing, or changing milestones or payments.
- Buying marketplace credits outside an approved spend envelope.
- Fabricating missing opportunity facts, buyer identity, budgets, requirements, or application receipts.
- Circumventing anti-bot controls, provider access rules, MFA, or source policy.
- Storing raw provider passwords, browser cookies, MFA secrets, or provider OAuth tokens inside model prompts, model memory, source records, or OpportunityOS records.
- A universal write path for every source. Public demand sources such as Hacker News may produce pursuit candidates without exposing a native application action.

## 3. Architecture

```text
Provider Accounts and Public Sources
Freelancer | Contra | Gmail | GitHub | Reddit | Hacker News | future sources
        |
        v
Connection Gateway
OAuth callbacks | account identity | scopes | refresh | secret references | health
        |
        v
Provider Adapters
poll | webhook | push | stream | provider-normalization | policy metadata
        |
        v
Ingestion Runtime
scheduler | leases | cursors | idempotency | retries | rate control | receipts
        |
        v
Immutable Observation Store + Outbox
raw source facts | source payload reference | hashes | provenance | health state
        |
        v
Canonical Opportunity Ledger
aliases | revisions | dedup decisions | freshness | state | pursuit history
        |
        +----------------------+----------------------+----------------------+
        |                      |                      |
        v                      v                      v
Authenticated MCP         Query/Event API       OpportunityOS Consumer
GPT / Grok / Manus        future systems        intelligence + pursuit
                                                        |
                                                        v
                                              Provider Action Gateway
                                              apply/message when authorized
                                                        |
                                                        v
                                              Receipts + reply monitoring
```

### Separation rules

1. Provider adapters may emit source facts and provider capabilities, but may not assign commercial priority or authorize pursuit.
2. The ingestion runtime may schedule, retry, checkpoint, persist, and publish observations, but may not manufacture successful records after provider failure.
3. The ledger may merge identities only through recorded deterministic or evidence-backed decisions. Raw observations remain immutable.
4. OpportunityOS may derive fit, value, urgency, credibility, reuse, and pursuit decisions, but cannot obtain provider secrets.
5. The Provider Action Gateway may perform only actions allowed by the connection's current scopes, the provider adapter's capability declaration, and an OpportunityOS policy envelope.
6. An application receipt proves an attempted provider action. It does not prove acceptance, client review, a contract, payment, or a win.

## 4. Persistent Connection Contract

Each provider account is represented by a non-secret `ConnectionRecord`:

```ts
interface ConnectionRecord {
  id: string;
  provider: string;
  providerAccountId: string | null;
  accountDisplayName: string | null;
  authType: 'oauth2' | 'api_token' | 'public' | 'delegated';
  status:
    | 'PENDING'
    | 'HEALTHY'
    | 'DEGRADED'
    | 'AUTH_REQUIRED'
    | 'REAUTH_REQUIRED'
    | 'RATE_LIMITED'
    | 'UNAVAILABLE'
    | 'POLICY_BLOCKED'
    | 'DISABLED';
  scopes: string[];
  capabilities: ProviderCapability[];
  secretRef: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  lastRefreshAt: string | null;
  lastVerifiedAt: string | null;
  policyVersion: string;
  metadata: Record<string, unknown>;
}
```

### Credential rules

- `secretRef` points to a managed secret store. It never contains the credential itself.
- Refresh tokens, access tokens, API tokens, authorization headers, browser cookies, and MFA material are prohibited from model-visible records, logs, event payloads, hashes, receipts, and ledger rows.
- Token refresh uses a distributed lock so concurrent workers cannot race and invalidate one another.
- Each external consumer receives an agent-specific, revocable credential for the Acquisition Fabric, not the provider credential.
- Agent credentials carry least-privilege scopes such as `connections:read`, `opportunities:read`, `pursuits:prepare`, or `pursuits:execute`.
- Connection capability is factual and provider-specific. A connection may support `read_projects` and `read_messages` without supporting `submit_application`.
- Authentication state is shared across GPT, Grok, Manus, and OpportunityOS through the gateway; it is not copied into each runtime.

### Freelancer integration boundary

The owner's current Freelancer OAuth implementation becomes the canonical Freelancer connection provider. Acquisition Fabric must integrate through a stable callback/token-broker contract or shared secret reference. It must not create a competing OAuth client or second canonical token store.

## 5. Provider Adapter Contract

Each adapter declares retrieval and action capabilities:

```ts
interface ProviderAdapter {
  provider: string;
  version: string;
  retrievalModes: Array<'poll' | 'webhook' | 'push' | 'stream'>;
  capabilityManifest(connection: ConnectionRecord): ProviderCapability[];
  verifyConnection(connection: ConnectionRecord): Promise<ConnectionHealth>;
  collect(input: CollectionRequest): Promise<CollectionResult>;
  execute?(input: ProviderActionRequest): Promise<ProviderActionResult>;
}
```

`CollectionResult` contains:

- zero or more immutable source observations;
- the next cursor/checkpoint, when verified;
- source health before and after;
- observed, verified, rejected, and deduplicated counts;
- request and result fingerprints;
- an append-only collector receipt;
- explicit failure code and detail when unsuccessful.

The adapter must return zero verified observations when the upstream result is unavailable, unauthenticated, rate-limited beyond usable coverage, malformed, policy-blocked, or structurally unverifiable.

## 6. Managed Ingestion Runtime

The runtime must operate on managed infrastructure. The owner must not need to keep a computer, iPhone, or personal server online.

### Scheduling

Every provider receives a policy-controlled cadence based on source velocity, rate limits, available event mechanisms, and business value.

Initial targets:

| Source class | Preferred mechanism | Target acquisition latency |
|---|---|---:|
| High-velocity marketplace feed, including Freelancer | official stream/webhook when available; otherwise bounded polling | P95 <= 30 seconds |
| Direct inbox and marketplace messages | push/webhook when available; otherwise bounded polling | P95 <= 60 seconds |
| GitHub opportunity signals | webhook where installed plus bounded API reconciliation | P95 <= 60 seconds |
| Reddit and other public demand feeds | permitted official API polling/streaming | P95 <= 120 seconds |
| Hacker News | bounded official API polling | P95 <= 180 seconds |
| Sources with weak or restricted access, including Contra where necessary | permitted API first; compliant browser fallback only if explicitly approved and sustainable | provider-specific, health made explicit |

A provider's cadence may be slower when required by policy or rate limits. Slower coverage must be visible as `DEGRADED`; it must not be mislabeled `HEALTHY` or “no activity.”

### Worker behavior

- A distributed lease ensures only one active collector owns a provider/account/query partition at a time.
- Cursors are written only after observations and receipts are durably committed.
- Retries are bounded, use exponential backoff with jitter, and never weaken retrieval or verification policy.
- Rate-limit resets are respected. Workers do not spin aggressively against a blocked source.
- A dead-letter path preserves failed work for diagnosis without converting it into a successful empty run.
- Every run is replayable from immutable request metadata and source payload references when licensing and retention allow.
- The transactional outbox publishes ledger-processing events only after observation persistence commits.
- Backfills and live collection use separate priority lanes so historical work cannot starve near-real-time intake.

## 7. Immutable Source Observation

The Fabric's foundational evidence record is broader than the current marketplace-only interface:

```ts
interface SourceObservation {
  id: string;
  provider: string;
  connectionId: string | null;
  sourceType: 'marketplace_project' | 'inbound_message' | 'public_demand' | 'profile' | 'other';
  externalId: string | null;
  canonicalUrl: string | null;
  recordKind: 'buyer_opportunity' | 'service_listing' | 'message' | 'public_signal' | 'other';
  observedAt: string;
  retrievedAt: string;
  retrievalMethod: string;
  verified: boolean;
  contentFingerprint: string;
  sourceRevision: string | null;
  payloadRef: string;
  payloadHash: string;
  queryAttribution: Array<{ familyId: string; version: string }>;
  provenanceRefs: string[];
  sourcePermissions: Record<string, unknown>;
  receiptHash: string;
}
```

Rules:

- The payload is immutable. Changed provider content creates a new observation or revision record.
- `payloadRef` resolves to encrypted/private storage when content contains account data.
- `payloadHash` and `contentFingerprint` are deterministic, but secret values are removed before hashing.
- `verified: true` means successful provider retrieval plus local structural validation, not commercial credibility or buyer trustworthiness.
- An unsuccessful search produces a failure receipt and zero verified observations. It never becomes “no matching activity” unless the source query itself completed successfully and the provider response was verified.

## 8. Canonical Opportunity Ledger

The ledger separates raw evidence from the evolving understanding of a real-world opportunity.

### Core entities

1. `connections` — non-secret provider account and health metadata.
2. `collector_partitions` — provider/account/query ownership, cadence, cursor, and lease state.
3. `collector_runs` — one record per attempted collection with receipt linkage.
4. `source_observations` — immutable verified or rejected source records.
5. `opportunities` — canonical opportunity identity and current materialized state.
6. `opportunity_aliases` — provider/external-ID/URL aliases mapped to a canonical opportunity.
7. `opportunity_revisions` — append-only changes in title, body, budget, deadline, status, or source state.
8. `dedup_decisions` — why observations were linked, separated, or later split.
9. `evidence_links` — exact provenance from every derived field or decision to source observations.
10. `pursuits` — prepared, submitted, blocked, replied, won, lost, withdrawn, or expired pursuit state.
11. `action_receipts` — provider action attempt, outcome, provider IDs, timestamps, and non-secret evidence.
12. `notification_events` — candidate notifications, suppression/aggregation decisions, and delivery receipts.

### Identity and deduplication hierarchy

Deduplication is conservative and reversible:

1. Exact provider identity: `provider + connection/account context + externalId`.
2. Exact canonical URL after safe normalization.
3. Exact provider-native revision or stable object identity.
4. Exact deterministic content identity within a bounded time window.
5. Cross-source semantic similarity may create a `POSSIBLE_MATCH`, but cannot silently merge records unless corroborated by strong identity evidence.

Every merge records:

- canonical opportunity ID;
- participating observation IDs;
- method and algorithm/policy version;
- confidence;
- evidence references;
- timestamp;
- whether the decision was deterministic, automated with evidence, or human-approved.

A later contradiction may split aliases without deleting original observations or prior decisions.

### Provenance requirements

Every material ledger field must be one of:

- directly observed with one or more source references;
- derived with an algorithm/policy version, inputs, and evidence references;
- unknown.

Missing values remain unknown. Null is never silently converted into zero, false, an empty budget, or “no activity.”

## 9. Cross-Agent Access

The Fabric exposes two shared surfaces:

1. **MCP server** for GPT, Grok, Manus, and interactive agents.
2. **Authenticated query/event API** for OpportunityOS workers and other deterministic consumers.

Initial read tools:

- `list_connections`
- `get_connection_health`
- `list_recent_observations`
- `search_opportunities`
- `get_opportunity`
- `get_opportunity_provenance`
- `list_pursuits`
- `get_pursuit_receipt`

Initial governed write tools:

- `request_connection_reauthorization`
- `prepare_pursuit`
- `execute_authorized_pursuit`
- `withdraw_pursuit` when the provider supports it and policy permits

Cross-agent concurrency is controlled by idempotency keys, opportunity-level pursuit locks, provider action receipts, and a single canonical application state. Two agents must not submit two applications to the same opportunity.

## 10. OpportunityOS Consumer and Intelligence Layer

OpportunityOS consumes `OpportunityCreated`, `OpportunityRevised`, `InboundMessageObserved`, `ConnectionHealthChanged`, and `PursuitStateChanged` events.

### Fast decision path

A newly materialized opportunity immediately passes through:

1. source verification and freshness gate;
2. buyer-demand classification;
3. exact duplicate/application-history gate;
4. hard exclusions and source-policy checks;
5. capability and portfolio-evidence match;
6. economic floor and effective-effort estimate;
7. buyer credibility and scam-risk screening;
8. competition, urgency, and expiry analysis;
9. BuildGraph reuse/extend/fork preflight when relevant;
10. autonomous-pursuit policy.

Target processing latency from durable observation to decision is P95 <= 15 seconds.

### Outcome classes

- `REJECT` — preserve evidence and reason; do not pursue or notify.
- `WATCH` — retain and revalidate; dashboard only.
- `QUEUE` — promising but missing evidence, authorization, or urgency; digest/dashboard.
- `AUTO_PURSUIT_READY` — passes every policy gate and may be submitted automatically.
- `NEEDS_YOU` — high-value or time-sensitive opportunity blocked by a decision only the owner can make.
- `PURSUE_FAILED` — authorized attempt failed; retain receipt and determine retry/escalation.

## 11. Autonomous Pursuit Policy

An opportunity may enter `AUTO_PURSUIT_READY` only when all required conditions are true:

- source record is verified, fresh enough, and classified as genuine buyer demand;
- opportunity identity is canonical and no prior application exists;
- capability match clears the configured threshold with evidence;
- requirements are sufficiently understood to produce a truthful, specific proposal;
- relevant portfolio/project evidence is verified and approved for use;
- economics clear the configured minimum after estimated effort and application cost;
- buyer/source credibility clears the configured threshold and no hard risk disqualifier exists;
- requested work is permitted and within the owner's declared service scope;
- provider connection is healthy and currently exposes the required write capability;
- proposed bid, price, timeline, claims, attachments, and answers fit an approved provider-specific policy envelope;
- no contract acceptance, payment, milestone, legal commitment, or other forbidden action is bundled into submission;
- any application fee, credit, or Connect-like spend is zero or within a separately approved bounded spend envelope;
- the complete action payload is hashed, idempotent, and recorded before execution.

The Provider Action Gateway then:

1. acquires an opportunity/provider pursuit lock;
2. revalidates source state and connection capability;
3. verifies the action payload hash and policy version;
4. submits through the provider's permitted authenticated surface;
5. records provider response identifiers and an immutable receipt;
6. releases or retains the lock according to outcome;
7. starts reply/status monitoring;
8. emits an outcome event to OpportunityOS.

Unknown, contradictory, expired, stale, duplicated, or unverified conditions fail closed.

## 12. Notification Policy

High ingestion volume must not become high interruption volume.

### Immediate notification candidates

- a substantive direct client reply or invitation;
- `NEEDS_YOU` on a high-value or rapidly expiring opportunity;
- repeated failure of an otherwise authorized high-value pursuit;
- connection reauthorization that blocks near-term qualified work;
- a contract, payment, identity, legal, timeline, or scope decision outside autonomous authority;
- an exceptional P0/P0-Critical signal that cannot be pursued automatically.

### Suppressed from immediate notification

- routine successful ingestion;
- duplicates;
- rejected or watched opportunities;
- successful autonomous applications;
- routine provider health checks;
- ordinary low-value errors already scheduled for retry;
- newsletters, promotions, receipts, automated platform chatter, and non-substantive inbox activity.

Successful applications appear in the dashboard and concise digest with receipts. Candidate notifications are deduplicated and aggregated over a short window so one underlying event cannot produce alerts from multiple agents or sources. P0-Critical safety or deadline exceptions are not silently dropped by a global rate cap.

## 13. Error and Health Model

Canonical health states:

- `HEALTHY`
- `DEGRADED`
- `AUTH_REQUIRED`
- `REAUTH_REQUIRED`
- `RATE_LIMITED`
- `UNAVAILABLE`
- `SCHEMA_DRIFT`
- `POLICY_BLOCKED`
- `CURSOR_INVALID`
- `DISABLED`

Error classes:

- authentication/authorization;
- rate/usage limit;
- network/timeout;
- upstream service failure;
- malformed payload/schema drift;
- cursor/checkpoint conflict;
- lease/concurrency conflict;
- persistence failure;
- dedup ambiguity;
- policy denial;
- provider action rejection;
- unknown internal failure.

Rules:

- A failed or unverifiable search never becomes “no inbound activity.”
- A partial source response is `DEGRADED` and includes the exact coverage limitation.
- Cursor recovery requires bounded replay or a documented reset. It cannot skip silently.
- Retries preserve the same action idempotency key and may not create duplicate applications.
- Action rejection is distinct from network uncertainty. Uncertain outcomes trigger provider reconciliation before retry.
- Source outages do not erase previously verified opportunities; they change freshness and health.

## 14. Security and Governance

- Managed secret storage with encryption at rest and access auditing.
- TLS for every Fabric interface.
- Agent-specific authentication, least privilege, expiry, rotation, and revocation.
- Provider secrets excluded from prompts, model context, receipts, logs, telemetry, hashes, and analytics.
- Immutable action receipts and append-only audit events.
- Global and provider-specific kill switches for collection and writes.
- Read and write capabilities independently configurable per provider and connection.
- Payload-bound policy envelopes for every consequential action.
- Separate deployment roles for connection management, collection, ledger processing, intelligence, and provider writes.
- Private/account-derived payload retention is configurable by source and must support deletion without corrupting receipt/provenance integrity; receipts retain non-secret hashes and deletion markers.

## 15. Deployment Shape

The design is provider-neutral but requires managed infrastructure with:

- PostgreSQL or equivalent transactional relational storage;
- a managed secret store;
- durable queue/event delivery;
- managed long-running or durable scheduled workers capable of sub-minute collection where policy permits;
- encrypted object storage for raw payloads that should not live directly in relational rows;
- authenticated HTTPS/MCP ingress;
- centralized structured logs and health telemetry.

The production architecture must not rely on a local laptop, phone, or home server remaining online.

## 16. Migration from Current OpportunityOS

The current repository already contains reusable deterministic contracts: marketplace source validation, collector receipts, GitHub Issues and Hacker News collectors, source health concepts, conservative demand deduplication, acquisition scoring, pursuit state, PostgreSQL boundaries, and receipt hashing.

Migration sequence:

1. Freeze and version the shared contracts described here.
2. Create the separate Acquisition Fabric repository and copy only provider access, connection, ingestion, observation, ledger, and cross-agent interface concerns.
3. Keep OpportunityOS commercial intelligence, BuildGraph integration, WorkOrders, trust policy, proposal preparation, and pursuit decisions in OpportunityOS.
4. Adapt the existing Freelancer OAuth work to the Connection Gateway contract.
5. Move GitHub Issues and Hacker News network collectors behind the Fabric adapter interface while retaining deterministic OpportunityOS normalization compatibility.
6. Add Gmail, Reddit, GitHub webhook/message coverage, and Contra according to provider access availability.
7. Replace direct OpportunityOS collector calls with Fabric event/query consumption.
8. Add the governed Provider Action Gateway one provider at a time, beginning with a source that exposes a compliant write path.
9. Run dual-read comparison during migration; do not delete the prior path until Fabric receipts and ledger outputs match expected fixtures and live health checks.

## 17. Testing Strategy

### Contract tests

- connection records never serialize secrets;
- provider capability manifests are explicit and stable;
- observations require source identity, timestamps, hashes, provenance, and receipts;
- ledger fields cannot lose evidence linkage;
- unknown values remain unknown;
- action payload hashes are deterministic.

### Adapter tests

For each provider:

- verified success;
- verified empty result;
- authentication failure;
- rate limit;
- timeout/network failure;
- malformed response/schema drift;
- cursor continuation;
- duplicate replay;
- secret redaction;
- action capability absent/present;
- provider action accepted, rejected, and uncertain.

### Ingestion tests

- lease exclusivity under concurrent workers;
- cursor advances only after durable commit;
- retry/backoff bounds;
- transactional outbox behavior;
- dead-letter retention;
- backfill cannot starve live partitions;
- receipt chain continuity;
- no duplicate observation or opportunity under at-least-once delivery.

### Ledger tests

- exact source-ID dedup;
- canonical URL dedup;
- revisions preserve history;
- semantic matches do not auto-merge without corroboration;
- merge and split are reversible and audited;
- cross-source provenance survives normalization;
- duplicate application history blocks a second submission.

### OpportunityOS tests

- fast scoring consumes ledger events idempotently;
- hard disqualifiers prevent pursuit regardless of score;
- application cost outside policy produces `NEEDS_YOU` or `REJECT` according to policy;
- evidence gaps cannot generate unsupported proposal claims;
- authorized application produces one receipt;
- uncertain action outcome reconciles before retry;
- direct client replies outrank cold opportunity alerts;
- successful autonomous applications do not create immediate notification spam.

### Security tests

- secret scanning across logs, events, database exports, telemetry, receipts, and model-visible tool results;
- agent scope enforcement;
- expired/revoked token rejection;
- provider write kill switch;
- cross-agent race attempting duplicate submission;
- prompt/input content cannot enlarge provider permissions or bypass policy.

### Performance and recovery tests

- P95 ingestion and decision SLOs under representative source volume;
- worker restart from durable cursor;
- queue redelivery and replay;
- provider outage and recovery;
- database failover/retry behavior;
- large backfill with live-lane priority preserved.

## 18. Acceptance Criteria

V1 is complete when:

1. At least one OAuth marketplace account persists independently of GPT, Grok, Manus, and OpportunityOS sessions.
2. GPT, Grok, Manus, and OpportunityOS can read the same canonical opportunity and provenance record through agent-specific credentials.
3. Freelancer or another approved high-velocity source can produce durable verified observations at P95 <= 30 seconds under available provider limits.
4. Gmail or another direct-message source can distinguish verified empty activity, verified new inbound activity, and unverifiable/search-failure state.
5. GitHub Issues and Hacker News operate through Fabric adapters with existing fail-closed evidence guarantees.
6. A replayed event does not create duplicate observations, opportunities, pursuits, applications, or notifications.
7. Every canonical opportunity field can be traced to source observations or a versioned derivation.
8. OpportunityOS produces a decision within P95 <= 15 seconds after durable observation persistence.
9. A fixture-backed qualified opportunity can pass through ingestion, ledger, scoring, proposal preparation, authorized provider submission, immutable receipt creation, and reply-monitor initialization exactly once.
10. Paid application mechanisms remain blocked unless an explicit bounded spend envelope exists.
11. Successful autonomous applications are recorded without immediate notification; substantive replies and high-value blocked decisions can notify immediately.
12. No provider secret appears in model-visible output, application records, logs, telemetry, hashes, receipts, or committed source.
13. Collection and write kill switches are verified.
14. The system continues operating on managed infrastructure without any owner-operated device or server remaining online.

## 19. Implementation Tranches

### Tranche A — Shared contracts and repository extraction

Define versioned connection, adapter, observation, cursor, receipt, ledger, event, and agent-auth contracts. Create the separate repository and establish CI, secret scanning, migrations, and local test harnesses.

### Tranche B — Connection Gateway and Freelancer integration

Integrate the owner's Freelancer OAuth implementation, persist non-secret connection state, establish secret references, health verification, agent credentials, and token-refresh locking.

### Tranche C — Ingestion runtime and canonical ledger

Implement leases, schedules, cursors, immutable observations, transactional outbox, aliases, revisions, dedup decisions, provenance, query APIs, and MCP read tools.

### Tranche D — Live source migration and expansion

Migrate Freelancer, GitHub Issues, and Hacker News; add Gmail, Reddit, GitHub event/message coverage, and Contra according to permitted provider surfaces.

### Tranche E — OpportunityOS consumer

Consume ledger events, run fast gates and commercial intelligence, preserve BuildGraph reuse checks, materialize dashboard states, and generate proposal/application packets from evidence.

### Tranche F — Provider Action Gateway

Enable provider-specific autonomous applications behind capability, economics, evidence, spend, idempotency, and payload-bound policy gates. Add reconciliation and reply monitoring.

### Tranche G — Calibration

Measure qualified opportunities, applications, replies, wins, false positives, ignored exceptions, processing latency, provider health, and notification burden. Adjust scoring and notification thresholds from evidence without reducing ingestion coverage.

## 20. Definition of Done for the First Implementation Plan

The first implementation plan should cover Tranches A through C plus the Freelancer integration portion of Tranche B. It must stop before provider application writes. The output is a functioning shared substrate that persists the owner's Freelancer connection, continuously ingests verified source observations, materializes canonical opportunities with provenance, and exposes them consistently to GPT, Grok, Manus, and OpportunityOS.
