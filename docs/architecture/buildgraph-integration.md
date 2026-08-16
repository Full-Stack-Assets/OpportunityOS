# BuildGraph Integration

OpportunityOS treats BuildGraph OS as a blocking preflight dependency for new work.

## Existing preflight contract

`POST {BUILDGRAPH_BASE_URL}/v1/preflight`

OpportunityOS submits a build request containing name, description, purpose, project type, capabilities, technologies, target users, and features. The returned decision is persisted with its canonical `payloadHash`.

## Fail-closed preflight rule

- Missing/invalid preflight -> `BUILDGRAPH_PREFLIGHT_REQUIRED`
- `REUSE_EXISTING`, `EXTEND_EXISTING`, `MERGE_WITH_EXISTING`, `FORK_EXISTING`, `REFACTOR_EXISTING`, or `ARCHIVE_DUPLICATE` -> new-build execution is blocked and surfaced as reuse-required/Needs You work
- `CREATE_NEW` -> OpportunityOS may continue into policy evaluation

A factory may not override this result. The capability graph and knowledge layer below do not weaken or replace this preflight authority boundary.

## Capability graph extension

`packages/core/src/buildgraph-skills.ts` models reusable workflow capabilities independently from the executors that may perform them. Each capability declares its inputs, outputs, prerequisites, permissions, evidence requirements, verifier, risk, autonomy class, and failure paths.

The first registry covers the opportunity-to-delivery lifecycle:

`discover -> verify source -> qualify -> research -> prepare application -> plan fulfillment -> execute candidate work -> verify deliverable -> prepare delivery -> follow up`

Human approval, failure recovery, claim verification, and capability-gap learning are modeled as reusable cross-cutting capabilities rather than ad hoc branches in individual agents.

`resolveCapabilityGraph()` walks prerequisites and reports one of four states:

- `ready` — all required capabilities are available and no human gate is present.
- `human-gated` — capabilities are available, but one or more nodes require human authority.
- `blocked` — at least one required capability is unavailable.
- `prohibited` — the requested graph includes a capability explicitly marked prohibited.

Dependency cycles are rejected rather than executed.

## Unified knowledge layer v0.1

`packages/core/src/buildgraph-knowledge.ts` extends BuildGraph from build-preflight and capability routing into a source-preserving canonical identity layer. It does not copy or replace external source systems; it models their objects as source records and resolves them against canonical entities.

The v0.1 contracts include:

- canonical entities with stable IDs, normalized names, aliases, lifecycle status, source references, metadata, tags, timestamps, and provenance hashes;
- source records that preserve source system, source-native identity, URL, observation time, metadata, project hints, and provenance;
- typed relationship candidates such as `BELONGS_TO`, `DEPENDS_ON`, `SUPERSEDES`, `DUPLICATES`, `REUSES`, and `SUPPORTED_BY`;
- deterministic resolution where exact source-native identity outranks normalized names/aliases, which in turn outrank fuzzy name similarity;
- Knowledge Inbox dispositions including `LINK`, `UPDATE`, `CREATE_ENTITY`, and fail-closed `REVIEW`, with the broader contract reserving `MERGE`, `SUPERSEDE`, and `ARCHIVE` for governed workflows.

Ambiguous strong matches are never silently merged. Fuzzy similarity alone cannot merge or supersede canonical knowledge.

### GitHub-first ingestion

`ingestGitHubRepository()` converts repository metadata into:

1. a source record preserving GitHub repository ID and full name;
2. a repository entity candidate;
3. a project entity candidate;
4. a `BELONGS_TO` relationship candidate;
5. lifecycle state derived from archived status;
6. a technical metadata fingerprint including visibility, default branch, size, and search-index state when supplied.

Naming normalization identifies duplicate/renamed families as candidates without destructive auto-merge.

This GitHub adapter is a pure transformation. It does not modify repositories, branches, issues, pull requests, settings, or deployments.

## Unified knowledge layer v0.2

v0.2 adds persistence, additional source adapters, hybrid retrieval, and automatic knowledge-backed preflight.

### Persistent registry

`database/migrations/002_buildgraph_knowledge.sql` and `packages/postgres/src/knowledge-store.ts` persist:

- canonical entities and aliases;
- source records and entity-source links;
- typed relationships;
- Knowledge Inbox state;
- optional provider-neutral embedding vectors;
- deterministic ingestion receipts.

All writes are database-local, parameterized, and idempotent. Source-system writes are not part of this tranche.

### Batch ingestion and receipts

`packages/core/src/knowledge-ingestion.ts` classifies source batches using the v0.1 resolver and produces deterministic ingestion receipts. Invalid rows are isolated and counted rather than converted into invented knowledge.

`scripts/buildgraph-github-backfill.mjs` accepts a repository inventory export or sanitized fixture and transforms the full input into BuildGraph source/entity/relationship records. It performs no GitHub mutation.

### Drive, chat, Gmail, and Wisebase adapters

`packages/core/src/knowledge-adapters.ts` provides read-only normalization contracts for:

- Google Drive files;
- generic conversation/message history;
- Gmail messages that cross an explicit relevance threshold;
- Wisebase items/passages.

Gmail relevance is selective. Automated marketing, newsletters, receipts, and promotional evidence is down-ranked so the registry does not become a mailbox mirror.

Private source content belongs only in the private runtime registry and must never be committed to this public repository.

### Cross-source retrieval

`packages/core/src/knowledge-retrieval.ts` combines separate evidence components:

- exact source identity;
- canonical/alias name evidence;
- lexical text overlap;
- graph relationship evidence;
- optional embedding cosine similarity.

Exact source identity receives dominance over semantic similarity. Embeddings are provider-neutral supplied vectors; the core layer does not call an embedding provider directly.

### Automatic knowledge-backed preflight

`packages/core/src/knowledge-preflight.ts` compiles retrieval results before a new build can proceed.

Fail-closed states are:

- unavailable registry -> `BUILDGRAPH_KNOWLEDGE_UNAVAILABLE`;
- strong ambiguity -> `REVIEW`;
- reusable project/repository/component/capability evidence -> `REUSE_EVIDENCE_FOUND`;
- verified absence of reusable evidence -> `NO_REUSE_EVIDENCE`.

Only the last state may allow existing BuildGraph policy to consider `CREATE_NEW`.

## ChatGPT skills

Reusable ChatGPT/Codex instructions live under `skills/*/SKILL.md`. They are deliberately atomic so the runtime can load only the behaviors required by the resolved graph. Skill instructions cannot grant new permissions and remain subordinate to source-evidence, BuildGraph preflight, policy, approval, and verification controls.

## BuildGraph MCP app

`apps/buildgraph-mcp` is a tool-only MCP app intended for ChatGPT integration. It exposes a stateless Streamable HTTP endpoint at `/mcp` and a health endpoint at `/health`.

The capability tranche is read-only:

- `buildgraph_list_capabilities`
- `buildgraph_resolve_workflow`
- `buildgraph_check_readiness`
- `buildgraph_verify_completion`
- `buildgraph_capability_gaps`

The unified-knowledge tranche is also read-only:

- `buildgraph_ingest_github_repository`
- `buildgraph_resolve_knowledge_item`
- `buildgraph_classify_knowledge_inbox`
- `buildgraph_compile_knowledge_preflight`

The knowledge MCP tools perform deterministic transformation, classification, and preflight compilation only. They do not persist canonical records or mutate GitHub, Drive, Gmail, Wisebase, chat history, files, deployments, marketplaces, or any other external system.

No marketplace submission, client send, payment, deployment, publication, repository mutation, or other consequential write is exposed by this MCP app in the current tranche.

## Workflow plugin profiles

Repository-local descriptors under `plugins/` group the shared MCP tools and skills into separate workflow surfaces:

- `buildgraph-discovery`
- `buildgraph-planner`
- `buildgraph-fulfillment`
- `buildgraph-verifier`
- `buildgraph-delivery`

These descriptors are capability filters for later ChatGPT app registration; they are not independent authority sources and are not themselves an OpenAI-hosted installation manifest.

## Completion invariant

OpportunityOS must not treat executor output as proof of completion. The BuildGraph workflow invariant is:

`EXECUTED -> EVIDENCE_PRODUCED -> VERIFIED -> ACCEPTED`

`buildgraph_verify_completion` checks the evidence requirements attached to the exact capability path. An external action is not considered delivered, deployed, published, submitted, or otherwise complete without the applicable execution receipt.

The same evidence discipline applies to unified knowledge: an inferred relationship or semantic match is not equivalent to source evidence, and an inbox recommendation is not equivalent to a governed canonical mutation.

## Future authority work

A later write-capable source tranche may add external actions only after separate review. That tranche should payload-bind canonical mutations, selected reuse plans, and consequential actions into WorkOrder authorization so neither an executor nor a plugin can drift beyond the approved action.

Production runtime synchronization also requires a configured private PostgreSQL registry. Repository CI verifies code contracts but does not prove that private Drive, Gmail, chat, GitHub, or Wisebase source data has been synchronized successfully.
