# BuildGraph Unified Knowledge v0.2 Design

## Status

Approved by the user on 2026-08-16 through the explicit build sequence:

`Persistent Registry -> full GitHub backfill -> Drive + Chat ingestion -> Gmail relevance ingestion -> Wisebase synchronization -> semantic/cross-source retrieval -> automatic BuildGraph preflight`

This design extends v0.1 on `codex/buildgraph-v0.2` and preserves PR #16 as the independently reviewable v0.1 foundation.

## Goal

Turn the v0.1 source-preserving knowledge contracts into a persistent, queryable organizational-memory substrate that can ingest connected source systems, resolve canonical identity across them, retrieve evidence across sources, and supply verified reuse evidence automatically to BuildGraph preflight.

## Architecture decision

Use the existing PostgreSQL package and migration system as the single persistent registry. Do not add a separate vector database, document database, or search service in v0.2.

The system is split into seven ordered stages:

1. Persistent Registry
2. GitHub Estate Backfill
3. Drive + Chat Ingestion
4. Gmail Relevance Ingestion
5. Wisebase Synchronization
6. Cross-Source Retrieval
7. Automatic BuildGraph Preflight

Each stage is independently testable and cannot grant more external authority than the source connector already has.

## 1. Persistent Registry

Add PostgreSQL tables for:

- `knowledge_entities`
- `knowledge_entity_aliases`
- `knowledge_source_records`
- `knowledge_entity_sources`
- `knowledge_relationships`
- `knowledge_inbox`
- `knowledge_embeddings`
- `knowledge_ingestion_receipts`

Canonical entities remain stable identities. External source observations are append/upsert records tied to source-native identity. Relationships retain evidence references and provenance hashes.

The registry must support idempotent upserts. Replaying an unchanged source record may update `last_seen_at`, but must not duplicate canonical identity or relationship rows.

## 2. Full GitHub estate backfill

A GitHub backfill pipeline consumes repository metadata from the authenticated GitHub connector/API and feeds every accessible repository through the v0.1 `ingestGitHubRepository()` transformer.

The backfill produces:

- source records for each repository;
- repository entity candidates;
- project entity candidates;
- repository-to-project relationships;
- Knowledge Inbox rows for duplicate-family or ambiguous resolution;
- ingestion receipts summarizing counts and failures.

No repository settings, branches, issues, pull requests, deployments, or files are mutated.

A sanitized repository inventory fixture may be committed for tests, but private source contents and credentials may not be committed.

## 3. Drive + Chat ingestion

### Google Drive

Drive ingestion converts file metadata and retrieved text excerpts into source records. It records Drive file IDs, MIME type, modified time, ownership/sharing metadata where available, and a content hash derived from retrieved text rather than raw binary data.

Document content is persisted only to the private registry/runtime store, never committed to the public repository.

### Chat ingestion

Chat ingestion uses a generic conversation-message adapter so available chat-history exports, library files, or connector-provided chat records can be normalized without coupling BuildGraph to one vendor-specific export format.

Conversation and message entities preserve conversation IDs, message ordering/time, source reference, title/subject, and project hints. Chat ingestion must not infer a canonical project solely from fuzzy text similarity.

## 4. Gmail relevance ingestion

Gmail ingestion is selective, not a mailbox mirror.

A message qualifies when it has evidence of relevance to one or more of:

- active projects/products/repositories;
- freelance/client work;
- opportunities/proposals/contracts;
- investors/partnerships;
- deployments/operations;
- procurement/revenue recovery;
- research/build decisions.

Relevance classification produces an explicit score and reasons. Low-relevance messages are not persisted as knowledge content. Message IDs/thread IDs remain source-native identifiers.

No email is sent, labeled, archived, deleted, or otherwise mutated by this tranche.

## 5. Wisebase synchronization

Wisebase is treated as another source system, not as the canonical database.

Synchronization reads knowledge objects/documents available through the connected AI Wisebase service and normalizes them into source records and entity candidates. Existing canonical IDs are resolved using source-native identity and aliases before any new entity is created.

Sync receipts track source counts, links, updates, new candidates, reviews, and failures.

The first tranche is read-only from Wisebase. Canonical data is not pushed back to Wisebase automatically.

## 6. Semantic and cross-source retrieval

Implement one retrieval API over the persistent registry.

Retrieval combines:

- exact source-native identity;
- canonical/alias lookup;
- token/text search;
- relationship traversal;
- optional embedding cosine similarity when an embedding is present.

Embeddings are provider-neutral numeric vectors stored in `knowledge_embeddings`. The core retrieval layer never calls an external embedding provider directly. Source adapters or a later embedding worker may supply vectors. This keeps semantic retrieval available without binding BuildGraph to OpenAI or any other provider.

When no embedding exists, retrieval remains fully functional through deterministic lexical and graph evidence. Results expose separate component scores so semantic similarity cannot silently override source identity or approved decisions.

## 7. Automatic BuildGraph preflight

Add a preflight evidence compiler that queries the registry before `CREATE_NEW` is accepted.

For a proposed build, it retrieves:

- exact/alias project matches;
- repositories and components with related capabilities;
- prior decisions and constraints;
- reusable artifacts/skills/agents;
- duplicate or superseded candidates;
- archived candidates;
- source evidence supporting every recommendation.

The compiler emits a `KnowledgePreflightEvidence` payload consumed by the existing BuildGraph preflight contract.

Automatic preflight remains fail-closed:

- unavailable registry -> `BUILDGRAPH_KNOWLEDGE_UNAVAILABLE`;
- ambiguous strong canonical matches -> `REVIEW` / block new-build execution;
- reuse recommendation -> preserve existing BuildGraph reuse behavior;
- only verified absence of relevant reusable knowledge can support `CREATE_NEW`.

## Security and privacy constraints

1. No credentials, OAuth tokens, API keys, cookies, or refresh tokens enter canonical records.
2. Private Gmail, Drive, chat, or Wisebase content must never be committed to this public repository.
3. Raw source payloads are minimized. Persist source-native identity, hashes, extracted text required for retrieval, and provenance.
4. Source adapters are read-only in v0.2.
5. Canonical mutations are database-local and governed by deterministic resolution rules.
6. Ambiguous matches remain in `knowledge_inbox` with `REVIEW` status.
7. Fuzzy/semantic similarity alone cannot `MERGE`, `SUPERSEDE`, or `ARCHIVE` a canonical entity.
8. Existing BuildGraph preflight and Trust Kernel authority are not weakened.

## Error handling

Every ingestion run returns a receipt with:

- source system;
- run ID;
- observed time;
- attempted count;
- persisted count;
- linked count;
- updated count;
- created-candidate count;
- review count;
- skipped count;
- failed count;
- deterministic receipt hash.

Individual bad source rows do not abort a whole backfill unless registry integrity cannot be guaranteed. Database transaction failures fail closed.

## Testing

Tests must cover:

- migration schema presence and constraints;
- idempotent registry upserts;
- exact source identity linking;
- ambiguous alias resolution to `REVIEW`;
- GitHub estate batch transformation/backfill;
- Drive file normalization;
- generic chat/conversation normalization;
- Gmail relevance inclusion/exclusion;
- Wisebase normalization;
- lexical + relationship retrieval;
- embedding score behavior when vectors are supplied;
- source identity outranking semantic similarity;
- automatic preflight reuse evidence;
- registry-unavailable fail-closed behavior;
- no consequential connector writes.

## Out of scope

- production deployment;
- automatic email send/mutation;
- Drive writes/deletes;
- Wisebase write-back;
- automatic destructive deduplication;
- copying Git histories or full mailbox archives;
- provider-specific embedding generation;
- storing secrets in canonical knowledge.

## Completion criteria

v0.2 is complete when the repository contains a tested persistent registry implementation, runtime source adapters for the ordered source systems, a GitHub backfill path, cross-source retrieval, and an automatic preflight evidence compiler, with all repository test/typecheck/smoke/build gates passing and no private source data committed.