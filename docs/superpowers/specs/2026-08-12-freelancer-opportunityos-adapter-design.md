# Freelancer.com → OpportunityOS Adapter Design

**Date:** 2026-08-12  
**Status:** Approved and implemented on review branch  
**Primary runtime:** `connectors/freelancer/freelancer_mcp_server.py`

## Objective

Make Freelancer.com the first canonical marketplace source adapter for OpportunityOS while preserving the repository's `SOURCE → EVIDENCE → RANK` separation and fail-closed release boundary.

The adapter retrieves only source-backed Freelancer facts, normalizes them into a stable cross-language evidence record, and never fabricates opportunities after upstream failure.

## Scope

In scope:

- Read-only Freelancer project search through the Freelancer API.
- Public profile context using the official users collection and `usernames[]` query shape.
- OAuth authorization URL generation without token exchange or storage.
- Explicit connector health/capability reporting.
- Environment-only access token handling.
- Verified source provenance and strict local structural validation.
- Matching TypeScript evidence validation at `packages/core/src/source.ts`.

Out of scope:

- Bid submission.
- Messaging.
- Project acceptance.
- Milestone creation or release.
- Payments or other financial actions.
- Browser/session-cookie automation.
- Password, MFA, payment-credential, or session-cookie storage.
- Opportunity ranking or autonomous fulfillment inside the connector.

## Canonical evidence shape

```json
{
  "platform": "freelancer",
  "platform_id": "42",
  "title": "Build a Python data pipeline",
  "description": "Need ETL automation",
  "budget_min": 250,
  "budget_max": 800,
  "currency": "AUD",
  "bid_count": 7,
  "skills": ["Python"],
  "employer_id": "99",
  "deadline": null,
  "source_url": "https://www.freelancer.com/projects/python/build-python-data-pipeline",
  "retrieved_at": "2026-08-12T09:00:00Z",
  "retrieval_method": "freelancer_official_api",
  "verified": true,
  "raw_source": "freelancer"
}
```

Rules:

1. Missing or malformed optional source values become `null` or `[]`, never plausible defaults.
2. `verified: true` is permitted only for records from a successful API response that pass local structure checks.
3. A missing or structurally invalid project identifier/title invalidates that project record.
4. Upstream request failure, non-success HTTP status, malformed JSON, or unusable response structure produces zero projects.
5. Derived OpportunityOS judgments remain downstream and separate from source facts.

## Tool contracts

### `search_freelancer_projects(query, limit=5)`

- Validates non-blank query and limit `1..50`.
- Calls the active-project endpoint.
- Requests full description and job details for normalization.
- Returns semantic states `success`, `unavailable`, `invalid_response`, or `error`.
- Never returns `simulated_results` or a synthetic project.

### `get_freelancer_user_profile(username)`

- Validates a non-blank username.
- Queries `/users/0.1/users/` using `usernames[]` plus detail flags.
- Requires an exact returned username match before reporting `verified: true`.
- A constructed public profile URL is navigation metadata only and is not treated as verified API retrieval.

### `generate_freelancer_oauth_auth_url(client_id, redirect_uri)`

- URL-encodes authorization parameters.
- Does not exchange, persist, refresh, or return access tokens.

### `freelancer_connector_status()`

Reports version, mode, API hostname, boolean token configuration state, read capabilities, and write capabilities fixed to `false`.

## OpportunityOS evidence boundary

`packages/core/src/source.ts` defines `MarketplaceOpportunityEvidence`, `VerifiedMarketplaceOpportunityEvidence`, `assertVerifiedMarketplaceOpportunityEvidence`, and `marketplaceEvidenceId`.

This boundary prevents unverified source records from being treated as admitted evidence. The existing ranking model in `packages/core/src/opportunity.ts` remains a separate derived layer rather than being expanded with source-specific facts.

## CI and credential boundary

CI installs the connector dependencies, executes the Python tests with the real MCP SDK, compiles the Python module, and continues to run the existing Node tests, typecheck, smoke check, and workspace build.

`FREELANCER_ACCESS_TOKEN` remains environment-supplied. No real credential is committed. The connector reports only whether a token is configured.

## Acceptance criteria

The adapter is acceptable when:

- no fabricated opportunity path exists;
- source records carry provenance and explicit verification state;
- malformed optional values are not converted into source facts;
- upstream failure yields zero opportunities;
- profile retrieval requires an exact API-backed username match;
- the core evidence boundary rejects unverified records;
- no marketplace write tools exist;
- credentials are not emitted or persisted;
- connector tests, Python compilation, existing core tests, typecheck, smoke verification, and workspace build pass in CI;
- no deployment or live marketplace-write activation is performed by this change.
