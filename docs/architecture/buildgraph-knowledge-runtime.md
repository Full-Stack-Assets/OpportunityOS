# BuildGraph Knowledge Runtime

## Purpose

This document defines how connected source systems feed the persistent BuildGraph knowledge registry without copying credentials into model-visible data or granting source-system write authority.

## Authority boundary

Source connectors are read-only inputs in v0.2:

- GitHub: repository metadata inventory and source evidence
- Google Drive: file metadata plus retrieved text where explicitly available
- Chat/library source: conversation/message records or exports
- Gmail: message/thread metadata and relevant message text selected by relevance policy
- AI Wisebase: retrieved knowledge items/passages and source metadata

The only persistent write target is the private PostgreSQL BuildGraph registry. No connector write action is required for ingestion.

Private source content must never be committed to the public OpportunityOS repository. Repository fixtures contain only sanitized metadata.

Canonical metadata and searchable private content are deliberately separated. `knowledge_source_records` holds source identity, hashes, sanitized metadata, and provenance; `knowledge_source_content` holds retrieval text inside the private runtime database. Credentials, tokens, cookies, raw binary payloads, and other sensitive metadata are scrubbed before persistence.

## Connector mapping

### GitHub

Connector fields map to `GitHubRepositorySnapshot`:

| Connector field | BuildGraph field |
| --- | --- |
| `id` | `id` |
| `name` | `name` |
| `repository_full_name` / `full_name` | `fullName` |
| `display_url` / repository URL | `url` |
| `visibility` | `visibility` |
| `default_branch` | `defaultBranch` |
| `size` | `size` |
| `archived` | `archived` |
| `is_code_search_indexed` | `searchIndexed` |

The runtime enumerates every accessible repository page, normalizes each row, runs `ingestGitHubRepository()`, resolves against existing canonical entities, and persists source/entity/relationship/inbox rows plus one ingestion receipt.

### Google Drive

Drive search/fetch results map to `DriveKnowledgeInput`:

- file `id` -> source-native ID
- file title/name -> canonical document candidate name
- MIME type -> metadata
- modified/observed time -> `modifiedTime`
- Drive URL -> source URL
- retrieved text -> content hash plus separate private `retrievalText`
- project/file hints -> `projectHints`

Binary file bytes are not stored in canonical entities. Text required for retrieval is stored only in `knowledge_source_content` in the private registry.

### Chat/library source

The chat adapter is vendor-neutral. The runtime maps any available conversation export or library representation into:

- stable conversation ID
- title
- observed timestamp
- ordered messages with stable message IDs
- role
- message content hash
- combined private retrieval text
- project hints

A chat message cannot become a canonical project solely because of fuzzy text similarity.

### Gmail

The runtime uses Gmail read/search functions only. Message ID and thread ID remain authoritative source-native identifiers.

Before persistence, `scoreGmailKnowledgeRelevance()` applies deterministic relevance evidence. Messages below the persistence threshold are skipped and counted in the ingestion receipt. For accepted messages, subject/body retrieval text remains separate from canonical metadata.

No send, draft, label, archive, trash, or delete action is part of knowledge ingestion.

### AI Wisebase

Wisebase retrieval is treated as a source-system read. Retrieved items/passages are converted to `WisebaseKnowledgeInput` with:

- source-native item/document identity where available
- title/source name
- retrieved text hash and separate retrieval text
- observed time
- source URL where available
- sanitized collection/source metadata
- project hints

Wisebase remains a semantic retrieval surface; PostgreSQL remains the canonical registry. v0.2 does not push canonical records back into Wisebase.

## Persistent registry sequence

For each accepted source object:

```text
READ SOURCE
  -> NORMALIZE + SCRUB SOURCE RECORD
  -> SEPARATE PRIVATE RETRIEVAL TEXT
  -> RESOLVE CANONICAL ENTITY
  -> CLASSIFY INBOX DISPOSITION
  -> UPSERT SOURCE RECORD
  -> UPSERT PRIVATE SOURCE CONTENT WHEN PRESENT
  -> UPSERT/LINK CANONICAL ENTITY WHEN DETERMINISTICALLY SAFE
  -> PERSIST RELATIONSHIPS
  -> PERSIST REVIEW ITEM FOR AMBIGUITY
  -> RECORD INGESTION RECEIPT
```

Source identity always outranks fuzzy or semantic similarity.

## Backfill order

Initial bootstrap order:

1. GitHub estate metadata
2. Google Drive documents
3. chat/library history
4. relevant Gmail messages
5. Wisebase knowledge
6. optional supplied embeddings
7. enable knowledge-backed automatic BuildGraph preflight

This order creates strong project/repository identities before noisier document/message sources are resolved.

## Idempotency

Re-reading an unchanged source object:

- updates `last_seen_at`;
- may update current sanitized metadata/provenance hash;
- upserts retrieval text by source ID rather than duplicating it;
- does not create another canonical entity solely because the source was seen again;
- does not duplicate aliases, entity-source links, relationships, or receipts with the same deterministic identity.

## Retrieval

`PostgresKnowledgeStore.searchRetrievalCandidates()` retrieves candidate entities with aliases, source references, private text, graph relationships, and optional embeddings. `rankKnowledgeResults()` then ranks those candidates with separate evidence components:

- exact source identity
- canonical/alias name evidence
- lexical content overlap
- graph relationship evidence
- optional provider-neutral embedding similarity

PostgreSQL full-text search uses the isolated `knowledge_source_content` table. Exact source identity receives a dominance score and cannot be displaced by a semantically similar but source-unrelated item.

## Automatic preflight

Before authorizing `CREATE_NEW`, BuildGraph obtains a registry retrieval result and passes it to `compileKnowledgePreflight()`.

Fail-closed rules:

- registry unavailable -> `BUILDGRAPH_KNOWLEDGE_UNAVAILABLE`
- strong ambiguity -> `REVIEW`
- strong archived/superseded-only evidence -> `REVIEW`
- strong active reusable project/repository/component/capability evidence -> `REUSE_EVIDENCE_FOUND`
- only verified absence of reusable evidence -> `NO_REUSE_EVIDENCE`, allowing existing BuildGraph policy to consider `CREATE_NEW`

This knowledge gate supplements rather than replaces the existing BuildGraph preflight and Trust Kernel.

## Operational verification checklist

A runtime synchronization may be called successful only when all applicable checks are directly observed:

1. private PostgreSQL registry is reachable;
2. migration `002_buildgraph_knowledge.sql` is applied;
3. source connector read succeeds;
4. attempted/persisted/review/failure counts are recorded;
5. rerunning the same input is idempotent;
6. private source content is absent from repository commits/logs;
7. secret/raw metadata is absent from canonical source records;
8. `knowledge_source_content` contains only approved retrieval text tied to source IDs;
9. retrieval returns source evidence for known canonical projects;
10. ambiguous or historical-only duplicate families route to review;
11. automatic preflight blocks a known duplicate/reuse case;
12. automatic preflight fails closed when the registry is unavailable.

Repository CI can verify code contracts, but it cannot prove a private source synchronization occurred. Runtime success must never be inferred from unit tests alone.
