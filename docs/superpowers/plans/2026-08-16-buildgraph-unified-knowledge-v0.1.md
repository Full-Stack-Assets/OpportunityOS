# BuildGraph Unified Knowledge v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing OpportunityOS BuildGraph implementation with canonical entity records, source records, a Knowledge Inbox resolver, and a GitHub-first ingestion adapter without weakening existing BuildGraph preflight authority.

**Architecture:** Add a focused pure TypeScript knowledge module inside `packages/core` and export it through the existing core barrel. The module performs deterministic normalization, hashing, source-aware matching, inbox disposition, and GitHub repository transformation. The existing BuildGraph MCP app exposes these functions through new read-only tools. No persistence or consequential write is added in v0.1.

**Tech Stack:** TypeScript 6, Node.js >=22.13, Node built-in test runner, existing `@opportunityos/core`, MCP SDK, Zod, Express.

## Global Constraints

- Existing BuildGraph preflight remains fail-closed and authoritative.
- No production deployment.
- No destructive deduplication, repository deletion, or external source mutation.
- MCP additions remain read-only.
- Source-native identifiers and provenance hashes must be preserved.
- Ambiguous entity matches must resolve to `REVIEW`, never auto-merge.
- Fuzzy similarity alone cannot cause `SUPERSEDE` or `MERGE`.

---

### Task 1: Core knowledge contracts and deterministic helpers

**Files:**
- Create: `packages/core/test/buildgraph-knowledge.test.mjs`
- Create: `packages/core/src/buildgraph-knowledge.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `normalizeEntityName(value: string): string`
- Produces: `createCanonicalEntity(input): CanonicalKnowledgeEntity`
- Produces: `createSourceRecord(input): KnowledgeSourceRecord`
- Produces: entity/source/relationship types used by later tasks.

- [ ] **Step 1: Write failing tests** for normalization, stable IDs, source validation, provenance hashing, and archived lifecycle values.
- [ ] **Step 2: Run the core test command** and confirm the new tests fail because `buildgraph-knowledge.ts` does not yet exist.
- [ ] **Step 3: Implement minimal contracts/helpers** using existing `hashCanonical()` for deterministic hashes.
- [ ] **Step 4: Export the module** from `packages/core/src/index.ts`.
- [ ] **Step 5: Run tests and typecheck** and confirm existing BuildGraph behavior remains green.

### Task 2: Source-aware canonical entity resolution and Knowledge Inbox disposition

**Files:**
- Modify: `packages/core/test/buildgraph-knowledge.test.mjs`
- Modify: `packages/core/src/buildgraph-knowledge.ts`

**Interfaces:**
- Consumes: `CanonicalKnowledgeEntity`, `KnowledgeSourceRecord`.
- Produces: `resolveKnowledgeItem(source, entities): KnowledgeResolution`
- Produces: `classifyKnowledgeDisposition(source, resolution): KnowledgeDisposition`

- [ ] **Step 1: Add failing tests** for exact source-native ID matching, alias matching, fuzzy ranking, ambiguity, and low-similarity create behavior.
- [ ] **Step 2: Run the focused test** and confirm expected failures.
- [ ] **Step 3: Implement deterministic scoring** with source identity > exact normalized name/alias > token similarity.
- [ ] **Step 4: Implement disposition rules**: exact existing source -> `UPDATE`; unique strong alias/name -> `LINK`; ambiguous strong candidates -> `REVIEW`; low/no match -> `CREATE_ENTITY`.
- [ ] **Step 5: Run focused and full core tests**.

### Task 3: GitHub repository adapter

**Files:**
- Modify: `packages/core/test/buildgraph-knowledge.test.mjs`
- Modify: `packages/core/src/buildgraph-knowledge.ts`

**Interfaces:**
- Produces: `GitHubRepositorySnapshot` input type.
- Produces: `ingestGitHubRepository(repo): GitHubKnowledgeIngestion` containing source record, repository entity candidate, project entity candidate, and relationship candidates.

- [ ] **Step 1: Add failing tests** for active/archived repositories and naming normalization.
- [ ] **Step 2: Add duplicate-family tests** covering `VaporLoop`/`vapor-loop`, `moviesrule.com`/`-MoviesRule.com`, and `nextgengear`/`Nextgengear.cc` as related candidates without destructive auto-merge.
- [ ] **Step 3: Implement repository-to-knowledge transformation** preserving GitHub numeric ID, full name, URL, visibility, default branch, size, archive state, and search-index state.
- [ ] **Step 4: Run focused and full core tests**.

### Task 4: Read-only BuildGraph MCP tools

**Files:**
- Modify: `apps/buildgraph-mcp/src/server.ts`
- Modify: `docs/architecture/buildgraph-integration.md`

**Interfaces:**
- Consumes: `resolveKnowledgeItem`, `classifyKnowledgeDisposition`, `ingestGitHubRepository` from `@opportunityos/core`.
- Produces MCP tools:
  - `buildgraph_resolve_knowledge_item`
  - `buildgraph_ingest_github_repository`
  - `buildgraph_classify_knowledge_inbox`

- [ ] **Step 1: Add tool schemas** using Zod and read-only MCP annotations.
- [ ] **Step 2: Wire tools to pure core functions** with no external writes.
- [ ] **Step 3: Update BuildGraph architecture docs** with the new knowledge tranche and explicit authority boundary.
- [ ] **Step 4: Run BuildGraph MCP typecheck/build**.

### Task 5: Verification and handoff

**Files:**
- Modify only if required by failing verification.

- [ ] **Step 1: Run `npm test`**.
- [ ] **Step 2: Run `npm run typecheck`**.
- [ ] **Step 3: Run `npm run build`**.
- [ ] **Step 4: Open a pull request** from `codex/buildgraph-v0.1` to `main` describing exact completed scope and any remaining external runtime work.
- [ ] **Step 5: Verify CI status** and report failures without inventing successful results.