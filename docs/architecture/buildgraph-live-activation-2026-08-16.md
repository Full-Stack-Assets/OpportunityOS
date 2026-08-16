# BuildGraph Live Activation Snapshot — 2026-08-16

## Scope

This document records directly observed runtime state for the BuildGraph unified knowledge system. It distinguishes live evidence from code-only capability and from source/runtime gaps.

The architectural design remains in `buildgraph-knowledge-runtime.md`. This snapshot is the authoritative activation-status record for the 2026-08-16 rollout.

## Runtime database

**State: LIVE / VERIFIED**

A private PostgreSQL registry is provisioned on the existing Full-Stack-Assets Supabase environment.

Migration `002_buildgraph_knowledge.sql` has been applied and the live registry contains the canonical BuildGraph knowledge tables, including:

- `knowledge_entities`
- `knowledge_entity_aliases`
- `knowledge_source_records`
- `knowledge_source_content`
- `knowledge_entity_sources`
- `knowledge_relationships`
- `knowledge_inbox`
- `knowledge_embeddings`
- `knowledge_ingestion_receipts`

The private content table is separate from canonical metadata.

### Runtime access controls

**State: VERIFIED**

- RLS is enabled on the knowledge tables.
- No public client policy grants direct table access.
- table privileges were revoked from `anon` and `authenticated`.
- source ingestion remains server-side/read-only with respect to external source systems.
- credentials, tokens, authorization material, raw binary payloads, and similar sensitive metadata are not canonical knowledge fields.

No database password, service-role credential, connector token, or private document body is committed to this repository.

## GitHub estate backfill

**State: COMPLETE FOR THE CURRENT CONNECTOR-ACCESSIBLE ESTATE**

The authenticated GitHub connector was paged until exhaustion.

Observed pagination terminated at repository offset/token `93`, and a final request at that position returned no repositories and no continuation token.

Live registry state after reconciliation:

- **93 GitHub source records**
- **93 repository entities**
- **93 project entities**
- **93 `BELONGS_TO` graph relationships**
- **6 GitHub ingestion receipts**

Every imported repository retained its native GitHub repository ID and repository URL as source evidence.

### Duplicate-family quarantine

A global normalized-name collision scan identified six families that must not be silently merged:

1. `astrokobi`
2. `fullstackassets`
3. `moviesrule`
4. `nextgengear`
5. `vaporloop`
6. `vibecoderz`

These families were routed to `knowledge_inbox` with `REVIEW` disposition. The `VaporLoop` family also contains an archived-vs-active lifecycle conflict. No duplicate family was destructively merged, deleted, archived, or superseded by the import process.

## Google Drive

**State: LIVE / BOUNDED WORK-CORPUS CANARY**

The Drive connector remains read-only.

Three high-signal work documents were registered as an initial bounded corpus:

- BuildGraph OS source document (`Build`)
- `DISCOVER_ A Standalone Autonomous Discovery Engine for BuildGraph.pdf`
- `The RSI Project: Exponentially Enhanced Master Architecture`

### Full-content verification

The canonical BuildGraph Drive document is fully persisted in `knowledge_source_content`:

- 26,714 characters
- canonical content hash verified against the live stored body
- source-native Drive ID preserved
- live full-text retrieval successfully matched the query `BuildGraph preflight duplicate work`

The DISCOVER and RSI records are registered with source identity, metadata, and verified local content hashes, but their full extracted bodies remain staged rather than claimed as fully loaded.

The current Drive activation is therefore intentionally **not** described as a complete mirror of the user's Drive. Personal/medical/unrelated records were not indiscriminately copied into BuildGraph.

## Gmail

**State: LIVE / SELECTIVE ZERO-PERSIST RESULT**

The Gmail connector remains read-only.

Three bounded searches were executed with promotions, updates, social mail, spam, Trash, and drafts excluded. Project/client/investor/freelance/automation terminology was used as relevance evidence.

Observed result:

- candidate messages surviving the broad gate: 1
- canonical messages persisted: 0
- automated/low-relevance messages skipped: 1
- failures: 0

This is a successful relevance-filter result, not a failed ingestion. BuildGraph is deliberately not a mailbox mirror.

## Wisebase canonical pilot

**State: LIVE / VERIFIED**

The AI Wisebase search connector exposed high-signal canonical records but did not expose stable programmatic file identities for direct persistence. Stable identities were instead resolved through the ChatGPT Library bridge at:

`/Wisebase/Canonical Pilot 2026-08-16`

The folder contains 14 canonical Markdown records plus `manifest.json`.

Live registry verification:

- **15 Wisebase source records**
- **15 canonical document entities**
- **15 full private-content rows**
- **15/15 canonical content hashes verified**
- source-native Library file IDs preserved
- source bridge recorded as `chatgpt-library/wisebase`

The corpus includes canonical/decision/evidence records for:

- BuildGraph OS
- OpportunityOS
- Tradewind
- BLAIZE SUNDAY
- shared capability registry

## First-class project promotion

**State: VERIFIED**

BuildGraph OS and BLAIZE SUNDAY were promoted from document-only evidence into first-class `project` entities so that live preflight cannot incorrectly treat those known systems as new work.

Relationships now connect:

- BuildGraph canonical/decision/evidence documents -> BuildGraph OS project
- canonical BuildGraph Drive document -> BuildGraph OS project
- BuildGraph OS -> OpportunityOS through `EMBEDDED_IN`
- OpportunityOS canonical/decision/evidence documents -> OpportunityOS project
- Tradewind canonical/decision/evidence documents -> canonical `tradewind-autonomous-dealflow` project
- BLAIZE SUNDAY canonical/decision/evidence documents -> BLAIZE SUNDAY project

## Chat-history source

**State: SOURCE-GATED**

A dedicated Chat History connector is not installed in the current runtime.

The ChatGPT Library root was inspected. It exposes organizational folders and files, including Wisebase, but no explicit chat/conversation/export namespace was found. Semantic Library search for a conversation export also returned an authorization error.

No chat-history rows were synthesized from model memory. A source-gated ingestion receipt records:

- source available: false
- explicit chat export found: false
- persisted: 0
- failed: 0

This is the correct fail-closed result until a stable conversation export/source becomes available.

## Live server-side preflight evaluator

**State: LIVE / VERIFIED**

A server-only PostgreSQL function `buildgraph_live_preflight(text)` is active over the private registry.

The evaluator uses canonical/alias identity plus related lexical source evidence and returns fail-closed structured results:

- `REUSE_EVIDENCE_FOUND`
- `REVIEW`
- `NO_REUSE_EVIDENCE`

`allowCreateNew` is true only for verified absence in this live identity gate.

### Security boundary

Direct execute permission is denied to:

- `anon`
- `authenticated`

Execute permission is granted to the server `service_role` only.

### Runtime probes

The live database evaluator was exercised against five probes:

- `OpportunityOS` -> known reuse evidence
- `BuildGraph` -> known reuse evidence
- `BLAIZE SUNDAY` -> known reuse evidence
- `VaporLoop` -> `REVIEW` because multiple source families/lifecycle evidence exist
- a deliberately absent synthetic name -> `NO_REUSE_EVIDENCE`, allowing new creation at this identity gate

OpportunityOS related evidence spans the GitHub project source plus the Wisebase canonical corpus; BuildGraph related evidence includes the Wisebase canonical corpus and the full-text Drive source.

## Automatic-preflight boundary

The **database-side live preflight evaluator is active**.

The repository MCP surface already contains the fail-closed knowledge preflight compiler, but the currently verified MCP process is not yet claimed to automatically invoke the private database function on every request. That final caller/runtime binding requires server environment configuration and a verified invocation path. It must not be inferred merely because the database evaluator exists.

Therefore the precise state is:

- private knowledge registry: **live**
- GitHub full accessible estate: **live / complete**
- Wisebase canonical pilot: **live / full-text**
- Drive bounded work corpus: **live / partial**
- Gmail relevance ingestion: **live / zero-persist by policy**
- chat history: **source-gated**
- server-side live identity preflight: **live**
- automatic MCP-to-live-registry invocation: **not yet claimed**

## Evidence rule

Repository CI proves code contracts. Runtime receipts and directly observed database/source checks prove live activation. Neither should be substituted for the other.

No production deployment, destructive duplicate consolidation, external message send, Drive mutation, Gmail mutation, or Wisebase write-back is asserted by this activation snapshot.
