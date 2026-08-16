# OpportunityOS Public Demand Collectors v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only GitHub Issues and Hacker News live collectors that emit verified, query-attributed public-demand observations and immutable collector receipts into the existing OpportunityOS demand-intelligence boundary.

**Architecture:** Keep provider HTTP access in a new `@opportunityos/public-demand-collectors` workspace package and keep deterministic query/receipt contracts in `@opportunityos/core`. Collectors use only official provider APIs, accept injected `fetch` for tests, return explicit source-health states, and emit zero verified observations on auth/rate/schema/network failure.

**Tech Stack:** TypeScript 6, Node.js >=22.13, Node built-in test runner, global/injected Fetch API, existing `@opportunityos/core`, GitHub REST API, official Hacker News Firebase API.

## Global Constraints

- Base this tranche on `codex/acquisition-demand-signal-v1`; do not modify `main`.
- GitHub Issues retrieval uses the official GitHub REST API only.
- Hacker News retrieval uses the official Hacker News Firebase API only.
- No browser scraping, cookie/session reuse, undocumented endpoints, or HTML fallback.
- No source writes, comments, submissions, applications, messages, proposals, contracts, payments, or production deployment.
- Credentials are environment/runtime inputs only and never appear in records, receipts, logs, tests, or errors.
- Provider/network/auth/rate/schema failure emits zero verified demand observations.
- Only open GitHub issues and live/non-deleted/non-dead HN records are emitted as active observations.
- Every emitted record carries the exact Demand Query Library ID/version that discovered it.
- Unknown values remain unknown; collectors do not infer budgets, buyer identities, or economic pain.
- TDD is mandatory; observe RED before production implementation for each behavior tranche.

---

### Task 1: Demand Query Library and Collector Receipt Domain Contracts

**Files:**
- Create: `packages/core/src/demand-queries.ts`
- Create: `packages/core/src/collector-receipts.ts`
- Create: `packages/core/test/demand-queries.test.mjs`
- Create: `packages/core/test/collector-receipts.test.mjs`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `DEMAND_QUERY_LIBRARY_V1: readonly DemandQueryFamily[]`
- Produces: `getDemandQueryFamily(id: string, version?: string): DemandQueryFamily`
- Produces: `matchesDemandQueryFamily(text: string, family: DemandQueryFamily): boolean`
- Produces: `createCollectorReceipt(input: CollectorReceiptInput): CollectorReceipt`
- Produces: `CollectorHealthState = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'SCHEMA_DRIFT' | 'POLICY_BLOCKED'`

- [ ] **Step 1: Write failing query-library tests**

```js
import {DEMAND_QUERY_LIBRARY_V1, getDemandQueryFamily, matchesDemandQueryFamily} from '../src/demand-queries.ts';

test('demand query families are unique, versioned, and source compatible', () => {
  const ids = DEMAND_QUERY_LIBRARY_V1.map((family) => `${family.id}@${family.version}`);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(DEMAND_QUERY_LIBRARY_V1.some((family) => family.id === 'EXPLICIT_DEVELOPER_HIRE'));
  assert.ok(DEMAND_QUERY_LIBRARY_V1.some((family) => family.id === 'PROCUREMENT_OR_RFP'));
  assert.equal(getDemandQueryFamily('AI_AUTOMATION_REQUEST').status, 'ACTIVE');
});

test('local matching respects positive and exclusion patterns', () => {
  const family = getDemandQueryFamily('EXPLICIT_DEVELOPER_HIRE');
  assert.equal(matchesDemandQueryFamily('Looking for a developer for a paid automation project', family), true);
  assert.equal(matchesDemandQueryFamily('Developer tutorial: how to get hired', family), false);
});
```

- [ ] **Step 2: Write failing receipt tests**

```js
import {createCollectorReceipt} from '../src/collector-receipts.ts';

const base = {
  collectorId: 'github-issues', collectorVersion: '1.0.0', provider: 'github_issues',
  queryFamilyId: 'AI_AUTOMATION_REQUEST', queryVersion: '1.0.0',
  startedAt: '2026-08-16T16:00:00Z', completedAt: '2026-08-16T16:00:01Z',
  retrievalMethod: 'official_api', credentialMode: 'anonymous_public',
  healthBefore: 'HEALTHY', healthAfter: 'HEALTHY', recordsObserved: 2,
  recordsVerified: 1, recordsRejected: 1, recordsDeduplicated: 0, signalsEmitted: 1,
  requestFingerprint: 'request-a', resultFingerprint: 'result-a', paginationState: null,
  failureCode: null, failureDetails: null,
};

const first = createCollectorReceipt(base);
const second = createCollectorReceipt(base);
assert.equal(first.receiptHash, second.receiptHash);
assert.equal(JSON.stringify(first).includes('Bearer'), false);
```

- [ ] **Step 3: Run RED**

Run: `npm test`

Expected: FAIL because `demand-queries.ts` and `collector-receipts.ts` do not exist.

- [ ] **Step 4: Implement the query contracts**

```ts
export interface DemandQueryFamily {
  id: 'EXPLICIT_DEVELOPER_HIRE' | 'SOFTWARE_NEEDS_BUILDING' | 'AI_AUTOMATION_REQUEST' |
    'INTEGRATION_PROBLEM' | 'MANUAL_PROCESS_PAIN' | 'REVENUE_LEAK' |
    'DATA_REPORTING_PAIN' | 'RELIABILITY_FAILURE' | 'PAID_BOUNTY' |
    'PROCUREMENT_OR_RFP' | 'MIGRATION_REQUEST' | 'MVP_PRODUCT_BUILD';
  version: '1.0.0';
  category: string;
  compatibleProviders: Array<'github_issues' | 'hacker_news'>;
  providerQueries: Partial<Record<'github_issues' | 'hacker_news', string[]>>;
  positivePatterns: RegExp[];
  exclusionPatterns: RegExp[];
  buyerIntentWeight: number;
  economicPainWeight: number;
  status: 'ACTIVE' | 'INACTIVE';
}
```

Populate all 12 approved families with deterministic patterns and GitHub query strings. Hacker News uses local patterns rather than pretending its API supports textual search.

- [ ] **Step 5: Implement receipt hashing with existing `hashCanonical()`**

The `receiptHash` is computed from the canonical receipt payload excluding `receiptHash` itself. Include `previousReceiptHash` only when supplied. Accept only the approved non-secret credential-mode enum.

- [ ] **Step 6: Export both modules and run GREEN**

Run: `npm test && npm run typecheck`

Expected: all repository tests and typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/demand-queries.ts packages/core/src/collector-receipts.ts packages/core/src/index.ts packages/core/test/demand-queries.test.mjs packages/core/test/collector-receipts.test.mjs
git commit -m "feat: add demand query and collector receipt contracts"
```

### Task 2: Public Demand Collector Workspace Boundary

**Files:**
- Create: `packages/public-demand-collectors/package.json`
- Create: `packages/public-demand-collectors/tsconfig.json`
- Create: `packages/public-demand-collectors/src/contracts.ts`
- Create: `packages/public-demand-collectors/src/index.ts`
- Create: `packages/public-demand-collectors/test/contracts.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `RawPublicDemandObservation`, `DemandQueryFamily`, `CollectorReceipt`, `CollectorHealthState` from `@opportunityos/core`.
- Produces: `CollectorRunResult`, `CollectorFetch`, `CollectorRunOptions`.

- [ ] **Step 1: Add failing workspace-boundary test**

```js
import {readFileSync} from 'node:fs';
import {createCollectorRunFailure} from '../src/contracts.ts';

const failure = createCollectorRunFailure('github_issues', 'RATE_LIMITED', 'rate limit reached');
assert.deepEqual(failure.observations, []);
assert.equal(failure.health.state, 'RATE_LIMITED');
const source = readFileSync(new URL('../src/contracts.ts', import.meta.url), 'utf8');
assert.equal(source.includes('Authorization: Bearer'), false);
```

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test packages/public-demand-collectors/test/contracts.test.mjs`

Expected: FAIL because the workspace package does not exist.

- [ ] **Step 3: Scaffold the workspace**

`package.json`:

```json
{
  "name": "@opportunityos/public-demand-collectors",
  "version": "0.1.0-simulation",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@opportunityos/core": "0.1.0-simulation"
  }
}
```

`contracts.ts` defines:

```ts
export type CollectorFetch = typeof fetch;
export interface CollectorHealth { provider: 'github_issues' | 'hacker_news'; state: CollectorHealthState; checkedAt: string; detail: string | null; }
export interface CollectorRunResult { observations: RawPublicDemandObservation[]; receipt: CollectorReceipt; health: CollectorHealth; rejected: Array<{sourceId: string | null; reason: string}>; }
```

- [ ] **Step 4: Add package verification to root scripts**

Update `npm test` to include `packages/public-demand-collectors/test/*.test.mjs`. Add collector workspace to root `typecheck` and `build` chains.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test && npm run typecheck && npm run build`

Commit: `feat: add public demand collector workspace`.

### Task 3: GitHub Issues Official-API Collector

**Files:**
- Create: `packages/public-demand-collectors/src/github-issues.ts`
- Create: `packages/public-demand-collectors/test/github-issues.test.mjs`
- Modify: `packages/public-demand-collectors/src/index.ts`

**Interfaces:**
- Produces: `collectGitHubIssues(input: GitHubIssuesCollectorInput): Promise<CollectorRunResult>`
- `GitHubIssuesCollectorInput` includes `family`, `limit`, `pageLimit`, optional `token`, optional `apiBase`, optional `apiVersion`, optional injected `fetchFn`, and explicit `now()` callback for deterministic tests.

- [ ] **Step 1: Write failing success-path test**

Use an injected fake fetch returning:

```json
{
  "total_count": 1,
  "items": [{
    "id": 123,
    "number": 77,
    "state": "open",
    "title": "Looking for a developer to build an AI intake automation",
    "body": "Paid contract. Budget $25k-$40k.",
    "html_url": "https://github.com/acme/ops/issues/77",
    "repository_url": "https://api.github.com/repos/acme/ops",
    "created_at": "2026-08-16T14:00:00Z",
    "updated_at": "2026-08-16T14:30:00Z",
    "user": {"login": "buyer"},
    "labels": [{"name": "help wanted"}]
  }]
}
```

Assert one observation with provider `github_issues`, external ID `acme/ops#77`, retrieval method `official_api`, exact query-family ID/version attribution, and a successful receipt.

- [ ] **Step 2: Add failing safety/error tests**

Cover:

```text
pull_request marker -> rejected
state=closed -> rejected from active output
401 -> AUTH_REQUIRED, zero observations
403 with rate-limit remaining=0 -> RATE_LIMITED, zero observations
429 -> RATE_LIMITED, zero observations
malformed JSON/schema -> SCHEMA_DRIFT, zero observations
network exception -> UNAVAILABLE, zero observations
token string absent from serialized output and receipt
limit outside 1..100 -> validation error before fetch
pageLimit outside 1..10 -> validation error before fetch
```

- [ ] **Step 3: Run RED**

Run: `node --experimental-strip-types --test packages/public-demand-collectors/test/github-issues.test.mjs`

Expected: FAIL because `github-issues.ts` does not exist.

- [ ] **Step 4: Implement GitHub API request construction**

Use:

```ts
const query = `${providerQuery} is:issue state:open`;
const url = new URL('/search/issues', apiBase);
url.searchParams.set('q', query);
url.searchParams.set('sort', 'created');
url.searchParams.set('order', 'desc');
url.searchParams.set('per_page', String(limit));
```

Headers include `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`, and a fixed User-Agent. Add `Authorization` only inside the request when a token exists. Never store that header in an object returned from the function.

- [ ] **Step 5: Normalize source-only facts**

For each structurally valid open issue emit `RawPublicDemandObservation` fields plus non-authoritative metadata for repository, labels, source timestamps, and query attribution. Do not derive budget or economic pain in the collector.

- [ ] **Step 6: Create collector receipt and health result**

A successful response with some rejected malformed records may be `DEGRADED`; a clean successful response is `HEALTHY`. Any auth/rate/network/schema-level failure returns zero observations.

- [ ] **Step 7: Run GREEN and commit**

Run: `npm test && npm run typecheck`.

Commit: `feat: add read-only GitHub Issues demand collector`.

### Task 4: Hacker News Official-API Collector

**Files:**
- Create: `packages/public-demand-collectors/src/hacker-news.ts`
- Create: `packages/public-demand-collectors/test/hacker-news.test.mjs`
- Modify: `packages/public-demand-collectors/src/index.ts`

**Interfaces:**
- Produces: `collectHackerNews(input: HackerNewsCollectorInput): Promise<CollectorRunResult>`
- Input includes `family`, `storySources: Array<'ask' | 'jobs'>`, `storyLimit`, `commentsPerStory`, optional `apiBase`, optional injected `fetchFn`, and deterministic `now()`.

- [ ] **Step 1: Write failing Ask-story success test**

Fake `/v0/askstories.json` returns `[1001]`; `/v0/item/1001.json` returns:

```json
{
  "id": 1001,
  "type": "story",
  "by": "founder",
  "time": 1786903200,
  "title": "Ask HN: Looking for someone to build an internal automation",
  "text": "Paid project. We need an AI workflow integration.",
  "kids": [2001]
}
```

Assert the story emits one `hacker_news_item` observation with canonical `https://news.ycombinator.com/item?id=1001`, query attribution, and official API retrieval provenance.

- [ ] **Step 2: Write failing bounded-comment test**

Return three child comment IDs while `commentsPerStory=1`; assert only one child request is made and at most one qualifying comment is emitted.

- [ ] **Step 3: Add failing rejection/error tests**

Cover dead/deleted item, malformed item, non-2xx source list, non-2xx item retrieval, schema drift, network failure, deterministic local query filtering, `storyLimit` outside `1..200`, and `commentsPerStory` outside `0..20`.

- [ ] **Step 4: Run RED**

Run: `node --experimental-strip-types --test packages/public-demand-collectors/test/hacker-news.test.mjs`.

Expected: FAIL because `hacker-news.ts` does not exist.

- [ ] **Step 5: Implement bounded official API retrieval**

Use only:

```text
/v0/askstories.json
/v0/jobstories.json
/v0/item/{id}.json
```

Filter story/comment text locally with `matchesDemandQueryFamily()`. Do not represent local filtering as provider-native search.

- [ ] **Step 6: Implement HN source health and receipts**

A list-level API failure fails the run closed. Individual malformed/dead/deleted records are rejected locally and may degrade coverage without fabricating replacements.

- [ ] **Step 7: Run GREEN and commit**

Run: `npm test && npm run typecheck`.

Commit: `feat: add read-only Hacker News demand collector`.

### Task 5: Collector-to-OpportunityOS Integration Contract

**Files:**
- Create: `packages/public-demand-collectors/test/integration.test.mjs`
- Modify: `packages/public-demand-collectors/src/index.ts` only if required for exports.

**Interfaces:**
- Consumes: collector output plus `assessSourceHealth`, `normalizePublicDemandObservation`, and `buildPublicDemandCandidate` from `@opportunityos/core`.
- Proves: verified provider record -> observation -> DemandSignal -> existing demand intelligence.

- [ ] **Step 1: Write the GitHub fixture acceptance test**

Run a GitHub issue fixture containing explicit paid developer demand and `$25k-$40k`. Feed the emitted observation to `buildPublicDemandCandidate()` with verified portfolio evidence. Assert:

```js
assert.equal(candidate.signal.verificationState, 'VERIFIED');
assert.equal(candidate.intent.kind, 'EXPLICIT_BUYER_REQUEST');
assert.equal(result.receipt.signalsEmitted, 1);
assert.equal(result.observations.length, 1);
```

Also assert the collector package source contains no external-action functions such as `send`, `comment`, `submit`, `createIssue`, `payment`, or `purchase` APIs.

- [ ] **Step 2: Add fail-closed integration test**

A rate-limited GitHub or failed HN run must produce `observations.length === 0`; attempting to construct a verified candidate from that run must therefore be impossible without fabricating an observation.

- [ ] **Step 3: Run RED/GREEN as needed**

Run: `npm test`.

Expected final result: all tests pass.

- [ ] **Step 4: Commit**

Commit: `test: prove collector to demand intelligence boundary`.

### Task 6: CI, Documentation, and Exact-Head Acceptance

**Files:**
- Modify: `.github/workflows/ci.yml` only if root scripts do not already exercise the new workspace fully.
- Create: `docs/public-demand-collectors.md`
- Modify: `README.md` only for truthful implemented-scope documentation.

**Interfaces:**
- Documents source boundaries, required runtime configuration, health states, and non-authority of collector output.

- [ ] **Step 1: Document runtime configuration**

Document optional `GITHUB_TOKEN`, default GitHub API base/version, HN API base, bounded limits, and explicit statement that no Reddit or GitHub Discussions live collector is implemented in this tranche.

- [ ] **Step 2: Verify test/typecheck/smoke/build**

Run through GitHub Actions on the exact branch head:

```bash
npm test
npm run typecheck
npm run smoke
npm run build
```

CI must also continue to run Freelancer and Fiverr connector suites unchanged.

- [ ] **Step 3: Inspect exact branch diff against `codex/acquisition-demand-signal-v1`**

Confirm no source-write API, credential literal, deployment action, or unrelated repository change entered the tranche.

- [ ] **Step 4: Update the stacked draft PR**

The PR must target `codex/acquisition-demand-signal-v1`, remain draft/unmerged for review, list exact files changed and verification evidence, and state that GitHub Issues/HN are the only live collectors implemented here.

## Plan Self-Review

- Spec coverage: query library, collector receipt, source health, GitHub Issues, HN story/comment bounds, fail-closed behavior, integration, CI, and trust boundary all map to explicit tasks.
- Scope isolation: Reddit, GitHub Discussions, autonomous outreach, persistence, and P0-Critical commercial reasoning remain outside this tranche.
- Type consistency: source names use `github_issues` and `hacker_news`, matching PR #17 public-demand provider types.
- Provider behavior: GitHub uses provider-native search; HN uses provider lists plus local deterministic filtering, matching the official APIs rather than inventing unsupported search functionality.
- No placeholders or unspecified implementation steps remain.
