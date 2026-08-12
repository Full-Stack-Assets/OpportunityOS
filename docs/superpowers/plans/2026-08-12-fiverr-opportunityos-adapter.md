# Fiverr OpportunityOS Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed, read-only Fiverr source adapter that classifies seller listings as `service_listing` evidence and prevents them from entering buyer-opportunity execution.

**Architecture:** Extend the shared marketplace evidence contract with a mandatory `record_kind`, update Freelancer to emit `buyer_opportunity`, and add an isolated Fiverr MCP Python SDK v2 connector under `connectors/fiverr`. Fiverr retrieval is treated as lower-trust public-web discovery: only actually retrieved and structurally validated records may be verified, and retrieval failure yields zero listings.

**Tech Stack:** Python 3.10+, MCP Python SDK v2 (`MCPServer`), requests, BeautifulSoup4, pytest, Node 22+, TypeScript 6, Node test runner, GitHub Actions.

## Global Constraints

- Fiverr records are always `record_kind: 'service_listing'` in this tranche.
- Freelancer records are `record_kind: 'buyer_opportunity'`.
- No simulated/fabricated Fiverr listings, prices, currencies, sellers, reviews, delivery times, or URLs.
- No Cloudflare bypass, browser-session automation, cookies, passwords, MFA, payment credentials, purchasing, messaging, or account writes.
- Affiliate URL generation is isolated from verification, ranking, fit, value, and execution decisions.
- `service_listing` records cannot satisfy buyer-opportunity execution admission.
- MCP runtime is SDK v2 (`mcp>=2,<3`) using `mcp.server.MCPServer`.
- `OPPORTUNITYOS_EXECUTION_MODE` remains `simulation`.
- Work remains on `codex/fiverr-source-adapter`; no merge or deployment in this tranche.
- Because the execution container cannot resolve GitHub, draft-PR CI is the authoritative RED/GREEN test runner for branch commits. The draft PR may be opened before Task 5 solely to obtain CI and must remain draft and unmerged.

---

### Task 1: Extend the shared source-evidence contract

**Files:**
- Modify: `packages/core/src/source.ts`
- Modify: `packages/core/test/source-evidence.test.mjs`
- Modify: `connectors/freelancer/freelancer_mcp_server.py`
- Modify: `connectors/freelancer/tests/test_freelancer_mcp_server.py`

**Interfaces:**
- Produces: `MarketplaceRecordKind = 'buyer_opportunity' | 'service_listing'`.
- Produces: `isBuyerOpportunityEvidence(evidence: MarketplaceOpportunityEvidence): evidence is VerifiedMarketplaceOpportunityEvidence`.
- Changes: `MarketplaceOpportunityEvidence.record_kind` becomes mandatory.

- [ ] **Step 1: Write failing core tests**

Add tests that reject missing/invalid `record_kind`, accept both enum values, and prove `isBuyerOpportunityEvidence()` returns true only for verified `buyer_opportunity` records.

- [ ] **Step 2: Run focused core tests to confirm RED**

Run: `node --experimental-strip-types --test packages/core/test/source-evidence.test.mjs`
Expected: FAIL because `record_kind` validation/helper do not exist.

- [ ] **Step 3: Implement the minimum TypeScript contract**

Add the union type, mandatory field validation, and helper:

```ts
export type MarketplaceRecordKind = 'buyer_opportunity' | 'service_listing';

export function isBuyerOpportunityEvidence(
  evidence: MarketplaceOpportunityEvidence,
): evidence is VerifiedMarketplaceOpportunityEvidence {
  try {
    assertVerifiedMarketplaceOpportunityEvidence(evidence);
    return evidence.record_kind === 'buyer_opportunity';
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Update Freelancer output and tests**

Add `record_kind: 'buyer_opportunity'` to every normalized Freelancer project and assert it in the connector suite.

- [ ] **Step 5: Run core + Freelancer tests to GREEN**

Run:
`node --experimental-strip-types --test packages/core/test/source-evidence.test.mjs`
`pytest -q connectors/freelancer/tests`

- [ ] **Step 6: Commit**

Commit message: `feat: classify marketplace evidence by record kind`

### Task 2: Add fail-closed Fiverr listing discovery

**Files:**
- Create: `connectors/fiverr/fiverr_mcp_server.py`
- Create: `connectors/fiverr/tests/conftest.py`
- Create: `connectors/fiverr/tests/test_fiverr_mcp_server.py`
- Create: `connectors/fiverr/requirements.txt`

**Interfaces:**
- Produces: `search_fiverr_listings(query: str, limit: int = 5) -> str`.
- Produces normalized records using the shared evidence shape with `record_kind: 'service_listing'`.

- [ ] **Step 1: Write failing connector tests**

Cover blank query, limit outside `1..50`, source-backed normalization, deterministic identity from canonical URL, missing optional values, non-200, network failure, Cloudflare/block-page detection, malformed/no-verifiable-listing response, no simulated path, and MCP v2 registration.

- [ ] **Step 2: Run Fiverr tests to confirm RED**

Run: `pytest -q connectors/fiverr/tests`
Expected: FAIL because connector does not exist.

- [ ] **Step 3: Implement minimal read-only connector**

Use `requests.get(..., timeout=10)`, `BeautifulSoup`, explicit block-page detection, bounded selectors, canonical Fiverr URLs, SHA-256 canonical-URL fallback identity when no source ID exists, and fail-closed JSON states: `success`, `unavailable`, `invalid_response`, `error`.

Never populate price/currency unless present and parseable from the retrieved listing content.

- [ ] **Step 4: Run Fiverr tests to GREEN**

Run: `pytest -q connectors/fiverr/tests`
Expected: PASS.

- [ ] **Step 5: Compile connector**

Run: `python -m py_compile connectors/fiverr/fiverr_mcp_server.py`
Expected: exit 0.

- [ ] **Step 6: Commit**

Commit message: `feat: add fail-closed Fiverr service-listing adapter`

### Task 3: Add Fiverr status/details/affiliate boundaries

**Files:**
- Modify: `connectors/fiverr/fiverr_mcp_server.py`
- Modify: `connectors/fiverr/tests/test_fiverr_mcp_server.py`

**Interfaces:**
- Produces: `fiverr_connector_status() -> str`.
- Produces: `get_fiverr_listing_details(url: str) -> str` only as verified retrieval or explicit unsupported/unavailable response.
- Produces: `generate_fiverr_affiliate_link(url: str, affiliate_id: str) -> str` as isolated, explicitly unverified URL construction unless current official format is verified.

- [ ] **Step 1: Write failing tests**

Test health/capability flags, no secret leakage, no write tools, detail lookup never claims success without retrieved facts, strict Fiverr URL validation, and affiliate output never changes evidence/ranking fields.

- [ ] **Step 2: Run focused tests to confirm RED**

Run: `pytest -q connectors/fiverr/tests -k 'status or details or affiliate or write'`
Expected: FAIL for missing functions/contracts.

- [ ] **Step 3: Implement the minimum tools**

Status reports `listing_search`, `listing_details`, `affiliate_url_generation`, `buyer_opportunity_discovery=false`, `messaging=false`, `purchasing=false`, `financial_actions=false`, plus `healthy|degraded|unavailable` retrieval state.

Details must fail closed; affiliate construction must validate `https://www.fiverr.com/...` and return `verified: false` unless current official parameter semantics are verified.

- [ ] **Step 4: Run full Fiverr suite to GREEN**

Run: `pytest -q connectors/fiverr/tests`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add Fiverr capability and auxiliary tool boundaries`

### Task 4: Integrate docs and CI

**Files:**
- Create: `connectors/fiverr/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/architecture/overview.md`

**Interfaces:**
- CI installs both connector dependency sets, runs both connector suites, compiles both Python servers, then preserves existing Node typecheck/smoke/build gates.

- [ ] **Step 1: Update CI**

Install `connectors/fiverr/requirements.txt`, run `pytest -q connectors/fiverr/tests`, and compile the Fiverr module alongside existing Freelancer verification.

- [ ] **Step 2: Document source classification**

Document `buyer_opportunity` versus `service_listing`, explain that Fiverr seller listings are intelligence inputs and cannot directly create client WorkOrders, and state the fail-closed/no-Cloudflare-bypass boundary.

- [ ] **Step 3: Run complete verification**

Run:
`npm test`
`pytest -q connectors/freelancer/tests connectors/fiverr/tests`
`python -m py_compile connectors/freelancer/freelancer_mcp_server.py connectors/fiverr/fiverr_mcp_server.py`
`npm run typecheck`
`npm run smoke`
`npm run build`

Expected: all gates PASS.

- [ ] **Step 4: Commit**

Commit message: `ci: verify Fiverr marketplace adapter`

### Task 5: Exact-head review branch acceptance

- [ ] Open a draft PR from `codex/fiverr-source-adapter` to `main` without merging (may already be open for CI-backed TDD).
- [ ] Inspect exact PR head and GitHub Actions result.
- [ ] If CI fails, diagnose the exact failing step, reproduce the root cause, patch with a regression test where code-related, and rerun until green or a genuine external blocker is identified.
- [ ] Confirm no synthetic listing path, marketplace write tool, Cloudflare bypass, secret persistence, affiliate-driven ranking behavior, deployment activation, or production-success claim was introduced.
- [ ] Leave the PR draft and unmerged for review.