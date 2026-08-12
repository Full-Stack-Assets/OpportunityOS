# BuildGraph Integration

OpportunityOS treats BuildGraph OS as a blocking preflight dependency for new work.

## Existing preflight contract

`POST {BUILDGRAPH_BASE_URL}/v1/preflight`

OpportunityOS submits a build request containing name, description, purpose, project type, capabilities, technologies, target users, and features. The returned decision is persisted with its canonical `payloadHash`.

## Fail-closed preflight rule

- Missing/invalid preflight → `BUILDGRAPH_PREFLIGHT_REQUIRED`
- `REUSE_EXISTING`, `EXTEND_EXISTING`, `MERGE_WITH_EXISTING`, `FORK_EXISTING`, `REFACTOR_EXISTING`, or `ARCHIVE_DUPLICATE` → new-build execution is blocked and surfaced as reuse-required/Needs You work
- `CREATE_NEW` → OpportunityOS may continue into policy evaluation

A factory may not override this result. The capability graph added below does not weaken or replace this preflight authority boundary.

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

## ChatGPT skills

Reusable ChatGPT/Codex instructions live under `skills/*/SKILL.md`. They are deliberately atomic so the runtime can load only the behaviors required by the resolved graph. Skill instructions cannot grant new permissions and remain subordinate to source-evidence, BuildGraph preflight, policy, approval, and verification controls.

## BuildGraph MCP app

`apps/buildgraph-mcp` is a tool-only MCP app intended for ChatGPT integration. It exposes a stateless Streamable HTTP endpoint at `/mcp` and a health endpoint at `/health`.

The first tool tranche is read-only:

- `buildgraph_list_capabilities`
- `buildgraph_resolve_workflow`
- `buildgraph_check_readiness`
- `buildgraph_verify_completion`
- `buildgraph_capability_gaps`

No marketplace submission, client send, payment, deployment, publication, or other consequential write is exposed by this MCP app in the current tranche.

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

## Future authority work

A later write-capable tranche may add external actions only after separate review. That tranche should payload-bind the selected reuse plan and consequential action into WorkOrder authorization so neither an executor nor a plugin can drift beyond the approved action.