# BuildGraph Unified Knowledge v0.1 Design

## Status

Approved for implementation on 2026-08-16. This design extends the existing OpportunityOS BuildGraph integration rather than creating a second BuildGraph system.

## Goal

Turn BuildGraph from a build-preflight and capability graph into the canonical identity and provenance layer for a unified knowledge base spanning repositories, documents, conversations, email, research, reports, files, and connected services.

v0.1 is GitHub-first. It must create the data contracts and deterministic resolution logic required for later Drive, chat, Gmail, Wisebase, and other source adapters without weakening the existing fail-closed BuildGraph preflight.

## Existing architecture retained

The current implementation already provides:

- blocking BuildGraph preflight for new work;
- reuse decisions including `REUSE_EXISTING`, `EXTEND_EXISTING`, `MERGE_WITH_EXISTING`, `FORK_EXISTING`, `REFACTOR_EXISTING`, `ARCHIVE_DUPLICATE`, and `CREATE_NEW`;
- reusable capability graph resolution;
- read-only BuildGraph MCP tools;
- evidence and verification invariants.

These remain authoritative. The knowledge layer supplies better evidence to preflight; it does not replace or bypass preflight.

## v0.1 scope

### 1. Canonical Entity Registry contract

Define normalized entities for:

- project
- product
- repository
- document
- research
- report
- conversation
- message
- person
- company
- opportunity
- decision
- requirement
- constraint
- capability
- component
- skill
- agent
- automation
- integration
- dataset
- deployment
- issue
- pull_request
- commit
- artifact
- source
- evidence

Each entity carries a stable ID, canonical name, aliases, lifecycle status, source references, tags, timestamps, and provenance hash.

### 2. Source Record contract

Every external object enters as a source record before it becomes canonical knowledge. Source records preserve source system, source-native ID, URL, observed timestamp, content hash, raw metadata, and optional project hints.

Source systems supported by the v0.1 contract include GitHub, Google Drive, Gmail, chat history, uploaded files, Wisebase, and generic external services. Only the GitHub adapter is implemented in v0.1.

### 3. Knowledge Inbox

New source records are classified into one disposition:

- `LINK`
- `MERGE`
- `UPDATE`
- `SUPERSEDE`
- `ARCHIVE`
- `CREATE_ENTITY`
- `REVIEW`

The inbox never silently promotes ambiguous information to canonical truth.

### 4. Deterministic entity resolution

Resolution uses exact source identity first, then normalized canonical name/aliases, then token similarity. Strong source identity always outranks fuzzy text similarity.

The resolver returns ranked candidates, an explicit confidence score, the matching reasons, and a recommended disposition. Ambiguous matches are `REVIEW`, never auto-merged.

### 5. GitHub-first ingestion

A GitHub repository adapter converts repository metadata into:

- a source record;
- a repository entity candidate;
- a project candidate;
- lifecycle state derived from archived status;
- aliases derived from repository naming normalization;
- a technical fingerprint containing visibility, default branch, size, and indexability where available.

The adapter must preserve GitHub repository ID and full name as source-native identity.

### 6. Relationship model

Knowledge relationships use typed edges such as:

- `BELONGS_TO`
- `IMPLEMENTS`
- `DEPENDS_ON`
- `SUPERSEDES`
- `DUPLICATES`
- `REUSES`
- `DERIVED_FROM`
- `DISCUSSED_IN`
- `SUPPORTED_BY`
- `DEPLOYED_TO`
- `GENERATED_BY`
- `RELATED_TO`
- `BLOCKED_BY`
- `OWNED_BY`
- `CREATED_FOR`

Relationships preserve provenance and cannot manufacture source evidence.

### 7. MCP read surface

Extend the existing BuildGraph MCP app with read-only tools for:

- resolving an incoming source item against canonical entities;
- converting GitHub repository metadata into knowledge records;
- evaluating Knowledge Inbox disposition.

The MCP tranche remains read-only and performs no GitHub, email, deployment, payment, publication, marketplace, or other consequential external write.

## Canonical rules

1. One canonical identity may have many aliases and many source records.
2. A source-native identifier is never discarded.
3. Archived material remains queryable but is down-ranked for active reuse.
4. Newer source timestamps do not automatically supersede explicit approved decisions.
5. Fuzzy similarity alone cannot supersede or merge canonical entities.
6. Evidence and provenance must survive every transformation.
7. The knowledge layer is source-preserving, not a bulk-copy replacement for GitHub, Drive, Gmail, or other systems.
8. BuildGraph preflight remains mandatory before new build execution.

## Failure behavior

- Missing source identity: accept as an inbox item but lower confidence.
- Duplicate source-native identity: recommend `UPDATE` or `LINK`, never `CREATE_ENTITY`.
- Exact alias collision across multiple entities: `REVIEW`.
- Low similarity: `CREATE_ENTITY` only when no stronger source evidence conflicts.
- Archived target entity: may match, but resolver reports archive state so preflight can avoid accidental reuse without review.
- Invalid timestamps or malformed source records: reject with an explicit validation error.

## Testing

Unit tests must cover:

- canonical name normalization;
- stable entity IDs and provenance hashes;
- exact source-ID matching;
- alias matching;
- fuzzy candidate ranking;
- ambiguity causing `REVIEW`;
- GitHub repository ingestion;
- archived repository lifecycle mapping;
- duplicate/renamed repository candidates such as `VaporLoop` / `vapor-loop`, `moviesrule.com` / `-MoviesRule.com`, and `nextgengear` / `Nextgengear.cc`;
- no regression to existing BuildGraph preflight and capability tests.

## Out of scope for v0.1

- copying entire Git histories into the knowledge base;
- semantic embeddings/vector search;
- Gmail/Drive/chat write access;
- automatic supersession of human-approved decisions;
- production deployment;
- destructive deduplication or repository deletion;
- authentication secrets inside canonical records.

## Completion criteria

v0.1 is complete when the core package can deterministically transform GitHub repository metadata into source/entity candidates, resolve those candidates against an existing registry, classify Knowledge Inbox disposition, expose the behavior through read-only MCP tools, and pass the repository test/typecheck/build gates.