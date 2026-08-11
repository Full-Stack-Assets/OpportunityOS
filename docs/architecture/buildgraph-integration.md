# BuildGraph Integration

OpportunityOS treats BuildGraph OS as a blocking preflight dependency for new work.

## Contract

`POST {BUILDGRAPH_BASE_URL}/v1/preflight`

OpportunityOS submits a build request containing name, description, purpose, project type, capabilities, technologies, target users, and features. The returned decision is persisted with its canonical `payloadHash`.

## Fail-closed rule

- Missing/invalid preflight → `BUILDGRAPH_PREFLIGHT_REQUIRED`
- `REUSE_EXISTING`, `EXTEND_EXISTING`, `MERGE_WITH_EXISTING`, `FORK_EXISTING`, `REFACTOR_EXISTING`, or `ARCHIVE_DUPLICATE` → new-build execution is blocked and surfaced as reuse-required/Needs You work
- `CREATE_NEW` → OpportunityOS may continue into policy evaluation

A factory may not override this result. A later release should payload-bind the selected reuse plan into the WorkOrder authorization so the execution path cannot drift after approval.
