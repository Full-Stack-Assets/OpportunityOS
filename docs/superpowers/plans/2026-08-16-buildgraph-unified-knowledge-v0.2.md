# BuildGraph Unified Knowledge v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist BuildGraph canonical knowledge, backfill the GitHub estate, normalize Drive/chat/Gmail/Wisebase sources, retrieve evidence across sources, and automatically feed verified reuse evidence into BuildGraph preflight.

**Architecture:** Extend the existing `@opportunityos/postgres` package with a canonical registry and retrieval store. Keep source adapters pure/read-only and provider-neutral. Ingestion pipelines transform connector data through `@opportunityos/core`, persist only to PostgreSQL, produce receipts, and leave ambiguity in the Knowledge Inbox. Automatic preflight consumes registry evidence but cannot weaken the existing BuildGraph preflight or Trust Kernel.

**Tech Stack:** TypeScript 6, Node.js >=22.13, PostgreSQL SQL migrations, existing `@opportunityos/core`, existing `@opportunityos/postgres`, MCP SDK/Zod/Express, Node built-in test runner.

## Global Constraints

- No production deployment.
- No private Gmail, Drive, chat, or Wisebase content committed to the public repository.
- No connector write actions in v0.2.
- No credentials/tokens/secrets in canonical records.
- Fuzzy or embedding similarity alone cannot merge, supersede, or archive canonical entities.
- Ambiguous strong matches must fail closed to `REVIEW`.
- BuildGraph preflight remains mandatory and fail-closed.
- Provider-specific embedding generation is out of scope; retrieval accepts optional supplied vectors.

---

### Task 1: Persistent canonical registry

**Files:**
- Create: `database/migrations/002_buildgraph_knowledge.sql`
- Create: `packages/postgres/src/knowledge-store.ts`
- Create: `packages/postgres/test/knowledge-store.test.mjs`
- Modify: `packages/postgres/src/index.ts`

**Interfaces:**
- Consumes: `CanonicalKnowledgeEntity`, `KnowledgeSourceRecord`, `KnowledgeRelationshipCandidate`, `KnowledgeDisposition` from `@opportunityos/core`.
- Produces: `PostgresKnowledgeStore` with `putEntity`, `putSourceRecord`, `linkEntitySource`, `putRelationship`, `putInboxItem`, `putEmbedding`, `recordReceipt`, `getEntities`, `getSourcesByEntity`, and `searchRegistry`.

- [ ] **Step 1: Write failing store tests** using a recording `SqlExecutor` and assert parameterized SQL, idempotent `ON CONFLICT`, and no interpolated source content.
- [ ] **Step 2: Run `node --experimental-strip-types --test packages/postgres/test/knowledge-store.test.mjs`** and confirm failure because `knowledge-store.ts` is missing.
- [ ] **Step 3: Add migration `002_buildgraph_knowledge.sql`** with tables:

```sql
create table if not exists knowledge_entities (
  id text primary key,
  kind text not null,
  canonical_name text not null,
  normalized_name text not null,
  status text not null check (status in ('active','archived','superseded','draft')),
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  provenance_hash text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create table if not exists knowledge_entity_aliases (
  entity_id text not null references knowledge_entities(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  primary key (entity_id, normalized_alias)
);

create table if not exists knowledge_source_records (
  id text primary key,
  system text not null,
  source_native_id text,
  title text not null,
  normalized_title text not null,
  url text,
  observed_at timestamptz not null,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  project_hints jsonb not null default '[]'::jsonb,
  provenance_hash text not null,
  last_seen_at timestamptz not null default now(),
  unique(system, source_native_id)
);

create table if not exists knowledge_entity_sources (
  entity_id text not null references knowledge_entities(id) on delete cascade,
  source_id text not null references knowledge_source_records(id) on delete cascade,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  primary key (entity_id, source_id)
);

create table if not exists knowledge_relationships (
  id text primary key,
  source_entity_id text not null references knowledge_entities(id) on delete cascade,
  target_entity_id text not null references knowledge_entities(id) on delete cascade,
  relationship_type text not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '[]'::jsonb,
  provenance_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_inbox (
  source_id text primary key references knowledge_source_records(id) on delete cascade,
  disposition text not null,
  target_entity_id text,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  reasons jsonb not null default '[]'::jsonb,
  state text not null default 'pending' check (state in ('pending','resolved','ignored')),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_embeddings (
  entity_id text primary key references knowledge_entities(id) on delete cascade,
  model text not null,
  dimensions integer not null check (dimensions > 0),
  vector jsonb not null,
  content_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_ingestion_receipts (
  id text primary key,
  source_system text not null,
  observed_at timestamptz not null,
  stats jsonb not null,
  receipt_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_entities_normalized_name_idx on knowledge_entities(normalized_name);
create index if not exists knowledge_alias_normalized_idx on knowledge_entity_aliases(normalized_alias);
create index if not exists knowledge_sources_system_native_idx on knowledge_source_records(system, source_native_id);
create index if not exists knowledge_relationship_source_idx on knowledge_relationships(source_entity_id);
create index if not exists knowledge_relationship_target_idx on knowledge_relationships(target_entity_id);
```

- [ ] **Step 4: Implement `PostgresKnowledgeStore`** using only `SqlExecutor.query(text, values)` and JSON serialization for structured fields.
- [ ] **Step 5: Export the store** from `packages/postgres/src/index.ts`.
- [ ] **Step 6: Run focused store tests and `npm run typecheck --workspace @opportunityos/postgres`**.
- [ ] **Step 7: Commit** as `feat: add persistent BuildGraph knowledge registry`.

### Task 2: Batch ingestion, receipts, and GitHub estate backfill

**Files:**
- Create: `packages/core/src/knowledge-ingestion.ts`
- Create: `packages/core/test/knowledge-ingestion.test.mjs`
- Create: `scripts/buildgraph-github-backfill.mjs`
- Create: `data/buildgraph/github-repositories.fixture.json`
- Modify: `packages/core/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `ingestKnowledgeBatch(items, existingEntities): KnowledgeBatchResult`
  - `createIngestionReceipt(sourceSystem, observedAt, stats): KnowledgeIngestionReceipt`
- Script consumes a JSON repository inventory and emits normalized JSONL/summary suitable for `PostgresKnowledgeStore` persistence at runtime.

- [ ] **Step 1: Write failing tests** for deterministic batch counts, partial row failures, ambiguity -> inbox `REVIEW`, and receipt hashing.
- [ ] **Step 2: Run focused tests and verify red**.
- [ ] **Step 3: Implement batch orchestration** around existing v0.1 resolver/disposition functions without connector I/O in core.
- [ ] **Step 4: Add a sanitized GitHub inventory fixture** containing repository metadata only, no source code or secrets.
- [ ] **Step 5: Add `scripts/buildgraph-github-backfill.mjs`** to transform the fixture/current connector export using `ingestGitHubRepository()` and print deterministic counts and JSONL rows.
- [ ] **Step 6: Add `buildgraph:backfill:github` script** to root `package.json`.
- [ ] **Step 7: Run tests and the backfill script** against the fixture.
- [ ] **Step 8: Commit** as `feat: add BuildGraph GitHub estate backfill`.

### Task 3: Drive, chat, Gmail, and Wisebase source adapters

**Files:**
- Create: `packages/core/src/knowledge-adapters.ts`
- Create: `packages/core/test/knowledge-adapters.test.mjs`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `ingestDriveFile(input: DriveKnowledgeInput): KnowledgeAdapterResult`
  - `ingestConversation(input: ConversationKnowledgeInput): KnowledgeAdapterResult`
  - `ingestGmailMessage(input: GmailKnowledgeInput): GmailKnowledgeAdapterResult`
  - `ingestWisebaseItem(input: WisebaseKnowledgeInput): KnowledgeAdapterResult`
  - `scoreGmailKnowledgeRelevance(input): { score: number; reasons: string[]; persist: boolean }`

- [ ] **Step 1: Write failing adapter tests** for stable source-native identity and private-content-safe metadata.
- [ ] **Step 2: Add Gmail relevance tests** where project/client/opportunity messages persist and newsletters/receipts/promotions do not.
- [ ] **Step 3: Implement Drive normalization** preserving file ID, MIME type, modified time, URL, content hash, and project hints.
- [ ] **Step 4: Implement generic conversation normalization** for conversation + message records without vendor coupling.
- [ ] **Step 5: Implement Gmail relevance scoring** with deterministic weighted evidence:

```text
+0.35 exact project/repository alias
+0.30 client/opportunity/proposal/contract intent
+0.20 known person/company/project source hint
+0.15 deployment/operations/procurement/revenue-recovery intent
-0.50 automated marketing/newsletter/receipt/promotional evidence
persist threshold: 0.50
```

- [ ] **Step 6: Implement Wisebase normalization** preserving native item ID, title, observed/modified time, URL if available, content hash, metadata, and project hints.
- [ ] **Step 7: Run focused/full core tests and typecheck**.
- [ ] **Step 8: Commit** as `feat: add cross-source BuildGraph adapters`.

### Task 4: Cross-source hybrid retrieval

**Files:**
- Create: `packages/core/src/knowledge-retrieval.ts`
- Create: `packages/core/test/knowledge-retrieval.test.mjs`
- Modify: `packages/core/src/index.ts`
- Extend: `packages/postgres/src/knowledge-store.ts`
- Extend: `packages/postgres/test/knowledge-store.test.mjs`

**Interfaces:**
- Produces:
  - `cosineSimilarity(a: number[], b: number[]): number`
  - `rankKnowledgeResults(query, candidates): KnowledgeRetrievalResult[]`
  - store query methods to fetch lexical/alias/source matches and related graph nodes.

- [ ] **Step 1: Write failing tests** proving exact source identity outranks semantic similarity.
- [ ] **Step 2: Add lexical/alias and relationship traversal tests**.
- [ ] **Step 3: Add optional embedding tests** with supplied vectors and mismatched-dimension rejection.
- [ ] **Step 4: Implement component scoring** with explicit fields `sourceIdentityScore`, `nameScore`, `textScore`, `relationshipScore`, `embeddingScore`, `combinedScore`.
- [ ] **Step 5: Ensure `combinedScore` cannot override an exact source identity and cannot trigger canonical mutation**.
- [ ] **Step 6: Extend Postgres store read queries** to retrieve candidate rows for ranking.
- [ ] **Step 7: Run focused/full tests + typecheck**.
- [ ] **Step 8: Commit** as `feat: add BuildGraph cross-source retrieval`.

### Task 5: Automatic BuildGraph preflight evidence compiler

**Files:**
- Create: `packages/core/src/knowledge-preflight.ts`
- Create: `packages/core/test/knowledge-preflight.test.mjs`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/buildgraph-mcp/src/server.ts`
- Modify: `scripts/verify-buildgraph-plugins.mjs`

**Interfaces:**
- Produces:
  - `compileKnowledgePreflight(request, evidence): KnowledgePreflightEvidence`
  - `decideKnowledgePreflightAvailability(result): 'READY' | 'REVIEW' | 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE'`
  - read-only MCP tool `buildgraph_compile_knowledge_preflight`.

- [ ] **Step 1: Write failing tests** for reuse evidence, ambiguity, archived candidates, and registry unavailable behavior.
- [ ] **Step 2: Implement evidence compiler** returning candidate projects/repos/components/decisions/constraints/artifacts plus source references and reasons.
- [ ] **Step 3: Implement fail-closed availability decision** where unavailable registry or strong ambiguity blocks `CREATE_NEW`.
- [ ] **Step 4: Add read-only MCP tool** with `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
- [ ] **Step 5: Extend the MCP safety verifier** to include the new tool and keep all tools read-only.
- [ ] **Step 6: Run core tests and MCP typecheck**.
- [ ] **Step 7: Commit** as `feat: add automatic knowledge-backed BuildGraph preflight`.

### Task 6: Connected-source runtime manifests and verification

**Files:**
- Create: `docs/architecture/buildgraph-knowledge-runtime.md`
- Modify: `docs/architecture/buildgraph-integration.md`
- Modify only as required by verification failures.

**Interfaces:**
- Documents exact connector-to-adapter mapping for GitHub, Google Drive, chat/library source, Gmail, and AI Wisebase.
- Documents persistence boundary, privacy rules, ingestion cadence recommendations, and operational verification checklist.

- [ ] **Step 1: Document runtime mappings** without embedding credentials or private source content.
- [ ] **Step 2: Document backfill/sync order** and idempotency rules.
- [ ] **Step 3: Run `npm test`**.
- [ ] **Step 4: Run connector suites** as part of repository CI command.
- [ ] **Step 5: Run `npm run typecheck`**.
- [ ] **Step 6: Run `npm run smoke`**.
- [ ] **Step 7: Run `npm run build`**.
- [ ] **Step 8: Open a stacked PR from `codex/buildgraph-v0.2` to `codex/buildgraph-v0.1`** so v0.2 can be reviewed independently before v0.1 merges.
- [ ] **Step 9: Record exact verification status**; never report runtime source synchronization as successful unless it was actually executed against a configured private registry.
