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
- retrieved text -> content hash and private retrieval content
- project/file hints -> `projectHints`

Binary file bytes are not stored in canonical entities. Text required for retrieval belongs in the private runtime store only.

### Chat/library source

The chat adapter is vendor-neutral. The runtime maps any available conversation export or library representation into:

- stable conversation ID
- title
- observed timestamp
- ordered messages with stable message IDs
- role
- message content hash
- project hints

A chat message cannot become a canonical project solely because of fuzzy text similarity.

### Gmail

The runtime uses Gmail read/search functions only. Message ID and thread ID remain authoritative source-native identifiers.

Before persistence, `scoreGmailKnowledgeRelevance()` applies deterministic relevance evidence. Messages below the persistence threshold are skipped and counted in the ingestion receipt.

No send, draft, label, archive, trash, or delete action is part of knowledge ingestion.

### AI Wisebase

Wisebase retrieval is treated as a source-system read. Retrieved items/passages are converted to `WisebaseKnowledgeInput` with:

- source-native item/document identity where available
- title/source name
- retrieved text hash
- observed time
- source URL where available
- collection/source metadata
- project hints

Wisebase remains a semantic retrieval surface; PostgreSQL remains the canonical registry. v0.2 does not push canonical records back into Wisebase.

## Persistent registry sequence

For each accepted source object:

```text
READ SOURCE
  -> NORMALIZE SOURCE RECORD
  -> RESOLVE CANONICAL ENTITY
  -> CLASSIFY INBOX DISPOSITION
  -> UPSERT SOURCE RECORD
  -> UPSERT/LINK CANONICAL ENTITY WHEN DETERMINISTICALLY SAFE
  -> PERSIST PRIVATE RETRIEVAL TEXT SEPARATELY WHEN PRESENT
  -> PERSIST RELATIONSHIPS
  -> PERSIST REVIEW ITEM FOR AMBIGUITY
  -> RECORD INGESTION RECEIPT
```

Source identity always outranks fuzzy or semantic similarity.

Private source content is stored in `knowledge_source_content` and is not copied into canonical entity/source metadata. The retrieval candidate query joins this private table only at runtime.

## Live activation status — 2026-08-16

A private PostgreSQL runtime is now active in the existing `Full-Stack-Assets` Supabase project.

Verified activation steps:

1. migration `002_buildgraph_knowledge.sql` applied successfully as `buildgraph_knowledge_v0_2`;
2. all `knowledge_*` tables and indexes created;
3. RLS is enabled on every BuildGraph knowledge table with no client-facing policies;
4. direct table privileges for `anon` and `authenticated` were revoked by `buildgraph_private_runtime_hardening`;
5. remote execution of the `public.rls_auto_enable()` SECURITY DEFINER helper was revoked from `public`, `anon`, and `authenticated`;
6. the `Full-Stack-Assets/OpportunityOS` GitHub repository was persisted as a live canary with source-native GitHub identity, canonical repository and project entities, a `BELONGS_TO` relationship, and an ingestion receipt;
7. replaying the same canary ingestion remained idempotent: one source row, two canonical entities, one relationship, and one receipt.

This proves the private registry and GitHub source-identity persistence path are live. It does not yet prove the full GitHub estate, Drive, chat history, relevant Gmail, or Wisebase corpus has been backfilled.

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
- may update current metadata/provenance hash;
- does not create another canonical entity solely because the source was seen again;
- does not duplicate aliases, entity-source links, relationships, or receipts with the same deterministic identity.

## Retrieval

Cross-source retrieval ranks evidence using separate components:

- exact source identity
- canonical/alias name evidence
- lexical content overlap
- graph relationship evidence
- optional provider-neutral embedding similarity

Exact source identity receives a dominance score and cannot be displaced by a semantically similar but source-unrelated item.

## Automatic preflight

Before authorizing `CREATE_NEW`, BuildGraph obtains a registry retrieval result and passes it to `compileKnowledgePreflight()`.

Fail-closed rules:

- registry unavailable -> `BUILDGRAPH_KNOWLEDGE_UNAVAILABLE`
- strong ambiguity -> `REVIEW`
- strong archived/superseded-only reusable evidence -> `REVIEW`
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
7. retrieval returns source evidence for known canonical projects;
8. ambiguous duplicate families land in `knowledge_inbox`;
9. automatic preflight blocks a known duplicate/reuse case;
10. automatic preflight fails closed when the registry is unavailable.

The live canary now verifies items 1, 2, 3, and 5 for the GitHub repository path. Full-estate and cross-source synchronization remains to be verified before the entire unified knowledge base is called fully populated.

Repository CI can verify code contracts, but it cannot prove a private source synchronization occurred. Runtime success must never be inferred from unit tests alone.
