# OpportunityOS Public Demand Collectors v1 — Design Specification

**Status:** Approved for implementation  
**Date:** 2026-08-16  
**Base:** `codex/acquisition-demand-signal-v1` / PR #17  
**Goal:** Convert permitted live GitHub Issues and Hacker News observations into verified, provenance-rich OpportunityOS demand signals without source writes, prohibited scraping, fabricated records, or bypassing the existing approval boundary.

## 1. Outcome

This tranche adds the first production-shaped live ingestion layer in front of the verified public-demand intelligence core introduced by PR #17.

The collectors do not decide whom to contact and do not perform external actions. They retrieve through provider-approved read-only APIs, preserve source-native identity and provenance, classify source health, emit replayable collector receipts, and produce normalized observations that the existing `public-demand.ts` pipeline can verify, classify, deduplicate, cross-match, and rank.

## 2. Architecture

The implementation adds a dedicated TypeScript workspace package, `@opportunityos/public-demand-collectors`, rather than putting network access inside `@opportunityos/core`.

```text
Provider API
    ↓
Source-specific read-only collector
    ↓
RawPublicDemandObservation[]
    ↓
CollectorReceipt
    ↓
normalizePublicDemandObservation()
    ↓
DemandSignal
    ↓
Existing buyer-intent / pain / credibility / portfolio / EV pipeline
```

`packages/core` remains the deterministic domain boundary. `packages/public-demand-collectors` owns HTTP retrieval and provider-specific response normalization.

## 3. Live Sources

### GitHub Issues

Use GitHub's official REST API only.

The collector queries the GitHub issue-search surface using versioned Demand Query Library entries. It admits issue records only and rejects search results carrying a pull-request marker. It preserves:

- repository identity;
- issue number and GitHub issue ID;
- title/body;
- state;
- author identity when source supplied;
- labels;
- creation/update timestamps;
- canonical `html_url`;
- query-family/version attribution;
- retrieval timestamp and method.

Only open issues are emitted as active observations. Closed issues may be observed for audit/revalidation purposes but cannot be emitted as active buyer demand.

Authentication is optional for public GitHub search but supported through an environment-supplied token for higher rate limits. The token is never returned, logged, persisted in observations, included in receipts, or exposed to the model.

### Hacker News

Use the official Hacker News Firebase API only.

The collector reads bounded subsets of:

- `/v0/askstories.json`;
- `/v0/jobstories.json`;
- `/v0/item/{id}.json`.

V1 scans story records plus a bounded number of direct child comments when configured. It never recursively crawls the complete comment graph.

HN has no query-search API. Demand Query Library patterns therefore filter retrieved official API records locally. The collector preserves HN item ID, author when supplied, item type, timestamp, canonical HN URL, parent/story relationship for comments, query-family attribution, and retrieval provenance.

Deleted, dead, malformed, or unverifiable items are rejected.

## 4. Demand Query Library

The library is versioned domain configuration owned by core.

Each query family contains:

- `id`;
- `version`;
- `category`;
- compatible source providers;
- provider-native query strings where supported;
- local positive patterns;
- exclusion patterns;
- buyer-intent weight;
- economic-pain weight;
- active/inactive status.

Initial active families:

1. `EXPLICIT_DEVELOPER_HIRE`
2. `SOFTWARE_NEEDS_BUILDING`
3. `AI_AUTOMATION_REQUEST`
4. `INTEGRATION_PROBLEM`
5. `MANUAL_PROCESS_PAIN`
6. `REVENUE_LEAK`
7. `DATA_REPORTING_PAIN`
8. `RELIABILITY_FAILURE`
9. `PAID_BOUNTY`
10. `PROCUREMENT_OR_RFP`
11. `MIGRATION_REQUEST`
12. `MVP_PRODUCT_BUILD`

Every emitted observation records the exact query-family ID and version responsible for discovery.

## 5. Collector Receipt

Every collector execution returns an immutable receipt with:

- collector ID/version;
- provider;
- query-family ID/version;
- started/completed timestamps;
- retrieval method;
- non-secret credential mode (`authenticated` or `anonymous_public`);
- source-health before/after;
- records observed/verified/rejected/deduplicated/emitted;
- request fingerprint;
- response/result fingerprint;
- pagination/cursor state when applicable;
- failure code/details when applicable;
- previous receipt hash when supplied;
- receipt hash.

Receipt hashes use the existing canonical hashing utility. Credentials and raw authorization headers are prohibited receipt fields.

## 6. Source Health

Collectors expose:

- `HEALTHY` — provider request succeeded and response contract verified;
- `DEGRADED` — provider reachable but a non-fatal bounded condition reduced coverage;
- `UNAVAILABLE` — request or required source verification failed;
- `AUTH_REQUIRED` — provider configuration requires credentials not present;
- `RATE_LIMITED` — provider rate limit prevents verified retrieval;
- `SCHEMA_DRIFT` — provider response no longer satisfies the expected contract;
- `POLICY_BLOCKED` — configured retrieval method violates the source policy.

Only `HEALTHY` and explicitly bounded `DEGRADED` runs may emit verified observations. `UNAVAILABLE`, `AUTH_REQUIRED`, `RATE_LIMITED`, `SCHEMA_DRIFT`, and `POLICY_BLOCKED` emit zero verified demand observations.

## 7. Fail-Closed Rules

- No synthetic fallback records.
- No browser cookie/session reuse.
- No undocumented API endpoint.
- No HTML scraping fallback after API failure.
- No source write operation.
- No retry that changes retrieval method or weakens verification policy.
- No active demand from closed/deleted/dead records.
- No query-family attribution means no emitted observation.
- Missing required source identity means rejection.
- Network or JSON/schema failure produces explicit health/failure output and zero verified observations.

## 8. Bounded Retrieval

Collectors must cap:

- per-query result count;
- pages per run;
- HN story count;
- HN direct-child comments per story;
- request timeout;
- total records emitted per collector call.

Bounds are validated before network access.

## 9. Trust Boundary

This tranche does not add:

- GitHub issue comments;
- HN comments/submissions;
- Reddit access;
- GitHub Discussions access;
- external applications;
- client messages;
- proposals;
- contracts;
- purchases/payments;
- credential persistence;
- production deployment.

Any later consequential action remains governed by the existing Action Gateway and payload-bound approval model.

## 10. Testing

### Query Library

- all IDs unique;
- all versions non-empty;
- compatible providers valid;
- active families have at least one discovery mechanism;
- exact query/version attribution is stable.

### Collector Receipts

- deterministic hashes for identical canonical payloads;
- hash changes when counts/query/source state change;
- previous receipt hash chains correctly;
- receipt serialization contains no token/authorization value.

### GitHub Issues

- successful official API response emits normalized open issues;
- pull requests are rejected;
- closed issues are not active observations;
- malformed records are rejected locally;
- 401/403/429/schema failure emit zero verified observations;
- token value never appears in result;
- query family/version appears on every record and receipt.

### Hacker News

- successful Ask/Job item retrieval emits valid source observations;
- direct comments are bounded;
- deleted/dead/malformed items are rejected;
- non-2xx/schema failure emits zero verified observations;
- query filtering is deterministic;
- query family/version appears on every record and receipt.

### Integration

A fixture-backed GitHub issue reading roughly “Looking for a developer to build an AI intake and CRM routing system; paid contract; budget $25k-$40k” must flow through collector -> observation -> existing public-demand intelligence and produce verified explicit buyer intent without sending anything externally.

A verified source record with explicit opportunity value >= $1,000,000 must remain eligible for the later `P0-CRITICAL / BUDGET` commercial-intelligence rule. This collector tranche preserves the observed value but does not independently invent or escalate unverified values.

## 11. Definition of Done

V1 is complete when GitHub Issues and Hacker News can independently retrieve through official read-only APIs, emit verified source observations with query attribution and collector receipts, fail closed under provider/auth/rate/schema failures, feed the existing PR #17 normalization/intelligence contracts, and pass repository tests, strict typecheck, smoke verification, and full build without modifying `main` or widening external-action authority.
