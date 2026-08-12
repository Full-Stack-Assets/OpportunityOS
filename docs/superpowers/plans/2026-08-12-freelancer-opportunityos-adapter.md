# Freelancer OpportunityOS Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed, read-only Freelancer.com source adapter and a matching verified marketplace-evidence boundary without widening OpportunityOS into marketplace writes or live consequential execution.

**Architecture:** Keep provider access in an isolated Python `MCPServer` connector under `connectors/freelancer`, targeting MCP Python SDK v2. Keep cross-provider evidence semantics in `packages/core/src/source.ts`, separate from the existing ranking model. Verify the connector independently in CI while preserving all existing Node gates.

**Tech Stack:** Python 3.10+, MCP Python SDK v2 (`MCPServer`), requests, pytest, Node 22+, TypeScript 6, Node test runner, GitHub Actions.

## Global Constraints

- No bid, message, project-acceptance, milestone, payment, or other marketplace-write tools.
- No simulated/fabricated source opportunities.
- `FREELANCER_ACCESS_TOKEN` remains environment-only and is never returned.
- `verified: true` requires successful API retrieval plus local structural validation.
- Source facts remain separate from derived ranking, economics, feasibility, and execution decisions.
- `OPPORTUNITYOS_EXECUTION_MODE` remains `simulation`.
- No deployment or production marketplace-write activation in this change.

---

### Task 1: Define the verified source-evidence boundary

**Files:**
- Create: `packages/core/test/source-evidence.test.mjs`
- Create: `packages/core/src/source.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `MarketplaceOpportunityEvidence`, `VerifiedMarketplaceOpportunityEvidence`, `assertVerifiedMarketplaceOpportunityEvidence`, `marketplaceEvidenceId`.

- [x] Write tests that accept valid verified source evidence and reject unverified, missing-provenance, malformed numeric, and malformed skill records.
- [x] Run the new test first and confirm RED because `source.ts` does not exist.
- [x] Implement the minimum source contract and validator.
- [x] Run the focused test to GREEN.
- [x] Export the source contract from the core package.

### Task 2: Add fail-closed Freelancer project discovery

**Files:**
- Create: `connectors/freelancer/freelancer_mcp_server.py`
- Create: `connectors/freelancer/tests/test_freelancer_mcp_server.py`
- Create: `connectors/freelancer/tests/test_freelancer_url_normalization.py`
- Create: `connectors/freelancer/tests/conftest.py`

**Interfaces:**
- Produces: `search_freelancer_projects(query: str, limit: int = 5) -> str`.

- [x] Define tests for query/limit validation, normalized successful results, explicit source provenance, missing optional fields, upstream failures, malformed payloads, malformed scalar types, invalid project identifiers, and normalized fallback URLs.
- [x] Confirm RED behavior against the uploaded connector's old assumptions and malformed-type paths.
- [x] Implement strict normalization and fail-closed states.
- [x] Request full descriptions and job details from the project endpoint.
- [x] Remove every simulated-result path.
- [x] Keep bounded request timeout and secret-safe error messages.

### Task 3: Correct profile lookup and OAuth utility behavior

**Files:**
- Modify: `connectors/freelancer/freelancer_mcp_server.py`
- Modify: `connectors/freelancer/tests/test_freelancer_mcp_server.py`

**Interfaces:**
- Produces: `get_freelancer_user_profile(username: str) -> str`, `generate_freelancer_oauth_auth_url(client_id: str, redirect_uri: str) -> str`.

- [x] Test profile success, non-200, network failure, malformed result, empty user collection, exact username matching, and query construction.
- [x] Replace username-as-path-ID behavior with `/users/0.1/users/` plus `usernames[]`.
- [x] Require an exact returned username match before `verified: true`.
- [x] URL-encode OAuth parameters and keep token exchange/storage out of scope.

### Task 4: Prove the no-write capability boundary

**Files:**
- Modify: `connectors/freelancer/freelancer_mcp_server.py`
- Modify: `connectors/freelancer/tests/test_freelancer_mcp_server.py`

**Interfaces:**
- Produces: `freelancer_connector_status() -> str`.

- [x] Report connector version, read-only mode, API hostname, and boolean token configuration.
- [x] Report search/profile/OAuth URL capabilities as available.
- [x] Report bid submission, messaging, and financial actions as unavailable.
- [x] Test that token values do not appear in status or validation responses.
- [x] Test that prohibited write-tool names do not exist.

### Task 5: Integrate verification into OpportunityOS CI and documentation

**Files:**
- Create: `connectors/freelancer/requirements.txt`
- Create: `connectors/freelancer/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/architecture/overview.md`
- Create: `docs/superpowers/specs/2026-08-12-freelancer-opportunityos-adapter-design.md`

- [x] Add bounded Python/MCP/requests/pytest dependency ranges.
- [x] Pin `actions/setup-python` by commit SHA in CI.
- [x] Install connector dependencies in CI so tool registration is tested against the real MCP SDK.
- [x] Run connector pytest and Python compilation before existing typecheck/smoke/build gates complete.
- [x] Document only environment-variable placeholders, never real credentials.
- [x] Document the read-only evidence boundary and non-activation of marketplace writes/deployment.

### Task 6: Final verification and review branch

- [ ] Open a pull request from `codex/freelancer-source-adapter` to `main` without merging.
- [ ] Inspect the exact PR head and GitHub Actions result.
- [ ] If CI fails, reproduce/fix the issue on the review branch and repeat until green or a genuine external blocker is identified.
- [ ] Confirm no secret value, simulated opportunity path, marketplace write tool, deployment activation, or production-success claim was introduced.
