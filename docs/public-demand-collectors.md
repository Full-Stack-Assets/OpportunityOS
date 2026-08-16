# Public Demand Collectors

OpportunityOS includes a read-only public-demand collector workspace at `packages/public-demand-collectors`.

This workspace is the provider-access boundary for live public demand discovery. It retrieves source records through approved provider APIs and emits provenance-rich observations into the deterministic demand-intelligence contracts in `packages/core`.

It does **not** send messages, comment on source platforms, submit applications or proposals, accept contracts, purchase anything, make payments, or authorize downstream actions.

## Implemented collectors

### GitHub Issues

`collectGitHubIssues()` uses GitHub's official REST issue-search endpoint.

The collector:

- accepts a versioned Demand Query Library family;
- adds `is:issue state:open` to the approved provider query;
- requests only through the official API;
- rejects results carrying a pull-request marker;
- rejects closed issues from the active demand output;
- preserves repository, issue ID/number, labels, author when supplied, source timestamps, canonical URL, query family/version, and API provenance;
- supports bounded pagination (`pageLimit` 1..10);
- supports bounded per-page results (`limit` 1..100);
- accepts an optional runtime token for authenticated API access;
- never returns, persists, hashes, or includes that token in collector receipts.

Authentication is optional for public GitHub search. A host may supply a GitHub token to the function for authenticated rate limits. The collector library itself does not load or persist environment secrets.

GitHub failure behavior:

| Condition | Health | Verified observations |
|---|---|---:|
| Successful verified response | `HEALTHY` | eligible records |
| Successful response with locally rejected records | `DEGRADED` | remaining verified records |
| `401` | `AUTH_REQUIRED` | 0 |
| `403` with exhausted rate limit | `RATE_LIMITED` | 0 |
| `429` | `RATE_LIMITED` | 0 |
| Other upstream/network failure | `UNAVAILABLE` | 0 |
| Unrecognized top-level API schema | `SCHEMA_DRIFT` | 0 |
| Query family not approved for GitHub | `POLICY_BLOCKED` | 0 |

There is no HTML/browser fallback after an API failure.

### Hacker News

`collectHackerNews()` uses the official Hacker News Firebase API.

V1 reads only:

- `/v0/askstories.json`;
- `/v0/jobstories.json`;
- `/v0/item/{id}.json`.

Hacker News does not provide provider-native text search in this boundary. OpportunityOS therefore retrieves a bounded subset of official Ask/Job IDs and applies the versioned Demand Query Library locally.

Bounds:

- `storyLimit`: 1..200 per selected story source;
- `commentsPerStory`: 0..20;
- only direct child comments are considered;
- no recursive comment-graph crawling.

Deleted, dead, malformed, unavailable, and locally non-matching items are rejected rather than replaced with synthetic records. A story-list failure fails that collector run closed. Individual item failures degrade coverage and create explicit rejection evidence.

Hacker News requires no credential in this implementation.

## Demand Query Library

`packages/core/src/demand-queries.ts` contains the v1 query registry.

Active families:

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

Every family is versioned. Every emitted observation contains the exact family ID and version responsible for discovery.

GitHub families contain approved provider-native query strings. Hacker News families deliberately contain no fake provider query because HN filtering occurs locally after official API retrieval.

## Collector receipts

`packages/core/src/collector-receipts.ts` produces immutable, canonical-hash-backed collector receipts.

A receipt records:

- collector/provider identity and version;
- query-family identity and version;
- retrieval timestamps and method;
- non-secret credential mode;
- health before/after;
- observed, verified, rejected, deduplicated, and emitted counts;
- request/result fingerprints;
- pagination state;
- failure code/details when applicable;
- optional previous receipt hash;
- current receipt hash.

Credentials, authorization headers, access tokens, and refresh tokens are not receipt fields.

## Collector health states

The collector domain supports:

- `HEALTHY`
- `DEGRADED`
- `UNAVAILABLE`
- `AUTH_REQUIRED`
- `RATE_LIMITED`
- `SCHEMA_DRIFT`
- `POLICY_BLOCKED`

Provider-level failures that prevent source verification emit zero verified observations. A downstream agent cannot convert a failed run into an opportunity without fabricating a record outside the collector contract.

## Integration with OpportunityOS

A successful collector returns `AttributedPublicDemandObservation[]`. These records extend the existing `RawPublicDemandObservation` contract with query attribution and source metadata.

The normal path is:

```text
Official provider API
  -> source-specific collector
  -> attributed verified observation
  -> collector receipt
  -> normalizePublicDemandObservation()
  -> DemandSignal
  -> buyer-intent classification
  -> economic-pain classification
  -> credibility/scam screening
  -> verified portfolio/BuildGraph evidence matching
  -> expected-value ranking
  -> later pursuit preparation / approval boundary
```

Collectors preserve source statements, including source-reported budgets, but do not independently turn them into commercial facts beyond the retrieved evidence. For example, an issue saying `$1.4M` remains preserved source evidence for the later P0-Critical commercial-intelligence rule; the collector does not invent that classification itself.

## Programmatic configuration

Both collectors accept injected `fetchFn` and `now()` functions to make source behavior deterministic in tests.

GitHub defaults:

- API base: `https://api.github.com`
- API version: `2026-03-10`
- result limit: `25`
- page limit: `1`
- request timeout: `10,000 ms`
- optional token: caller supplied only

Hacker News defaults:

- API base: `https://hacker-news.firebaseio.com`
- story limit: `50`
- direct comments per story: `0`
- request timeout: `10,000 ms`
- credentials: none

A future runtime/scheduler may pass an environment-managed GitHub token into `collectGitHubIssues()`. Secret acquisition belongs to that host boundary, not this collector package.

## Not implemented in this tranche

- Reddit live retrieval
- GitHub Discussions live retrieval
- DEV/Discourse/Indie Hackers live collectors
- broad autonomous crawling
- browser/session-cookie scraping
- posting or commenting on GitHub or Hacker News
- outbound email/messages/applications/proposals
- autonomous negotiation
- contract acceptance
- purchases/payments
- production deployment

Those capabilities require separate source/provider review and must not be inferred from the existence of the read-only collector package.

## Verification

The repository test suite covers query attribution, receipt hashing/chaining, GitHub success/error/rate/auth behavior, HN Ask/Job/item behavior, bounded comments, fail-closed source failures, token non-disclosure, and collector-to-demand-intelligence integration.

Run the repository gates with:

```bash
npm test
npm run typecheck
npm run smoke
npm run build
```

Passing fixture-backed tests proves the collector contracts and parsers against controlled provider responses. It does not, by itself, claim that a particular live provider request has been executed successfully in the current environment.
