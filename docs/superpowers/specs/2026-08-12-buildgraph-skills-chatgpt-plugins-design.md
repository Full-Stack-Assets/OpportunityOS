# BuildGraph Skills + ChatGPT Plugins Design

## Goal

Turn OpportunityOS from a collection of marketplace adapters, factories, verifiers, and operator workflows into a coherent capability graph that ChatGPT can discover and invoke through reusable skills and MCP plugin surfaces.

## Existing boundary

OpportunityOS already treats BuildGraph preflight as fail-closed. This design preserves that rule. No factory, skill, plugin, or agent may bypass a BuildGraph decision, source-evidence rule, approval contract, or verification boundary.

## Architecture

The implementation has three layers:

1. **Atomic ChatGPT skills** in `skills/` describe when and how to perform reusable workflow capabilities.
2. **BuildGraph registry** in `packages/core/src/buildgraph-skills.ts` declares machine-readable capabilities, dependencies, evidence requirements, autonomy class, and verifier links.
3. **Shared MCP server** in `apps/buildgraph-mcp/` exposes graph planning and workflow tools to ChatGPT. Thin plugin profiles in `plugins/` group the shared tools into distinct workflow surfaces without duplicating server logic.

## Skill families

- using-buildgraph
- discovering-opportunities
- qualifying-opportunities
- researching-opportunities
- preparing-applications
- planning-fulfillment
- executing-fulfillment
- verifying-deliverables
- preparing-client-delivery
- following-up
- routing-human-approval
- recovering-workflows
- learning-capability-gaps

Each skill has a narrow trigger-oriented description, explicit inputs/outputs, stop conditions, evidence requirements, and required sub-skills.

## Plugin profiles

### buildgraph-discovery
Read-only opportunity ingestion, normalization, capability-fit analysis, and source-evidence inspection.

### buildgraph-planner
Read-only capability resolution, dependency planning, readiness scoring, and gap detection.

### buildgraph-fulfillment
Execution planning and fulfillment routing. Consequential writes remain blocked unless the underlying adapter and policy layer authorize them.

### buildgraph-verifier
Read-only evidence validation, acceptance checking, claim verification, and completion determination.

### buildgraph-delivery
Delivery preparation and follow-up orchestration. External sends, submissions, payments, marketplace writes, or publication remain subject to platform-native and OpportunityOS approval gates.

## Capability contract

Every capability node contains:

- `id`
- `name`
- `description`
- `inputs`
- `outputs`
- `requires`
- `permissions`
- `evidence`
- `verifier`
- `risk`
- `autonomy`
- `failurePaths`

Edges use typed relationships: `REQUIRES`, `PRODUCES`, `VERIFIES`, `ENABLES`, `BLOCKS`, `FALLBACK_TO`, `REPAIRS`, `APPROVAL_REQUIRED`, `USES`, and `DELEGATES_TO`.

## Execution invariant

A workflow is not complete because an agent says it is complete. Completion requires:

`EXECUTED -> EVIDENCE_PRODUCED -> VERIFIED -> ACCEPTED`

If any required capability is unavailable, prohibited, unverified, or human-gated, BuildGraph returns a blocked/readiness state instead of fabricating success.

## ChatGPT app shape

Primary archetype: **tool-only**. The first release does not need a widget. The MCP server exposes concise structured tools and relies on ChatGPT for presentation. This keeps the implementation small and compatible with the existing OpportunityOS operator surface.

## Safety and authority

- Discovery and planning tools are read-only.
- Source adapters may not synthesize verified opportunities after upstream failure.
- External writes require the adapter to explicitly support the action and all OpportunityOS policy/approval gates to pass.
- No skill can elevate its own permissions.
- Plugin profiles are capability filters, not new authority domains.
- Evidence must remain distinct from factory output.
- Current simulation-only deployment boundaries remain unchanged unless separately authorized and verified.

## Success criteria

1. ChatGPT can discover the appropriate skill from a task description.
2. BuildGraph can return the required capability subgraph for a workflow.
3. Plugin profiles expose only the tools appropriate to their workflow family.
4. Missing capabilities are returned explicitly.
5. Verification and approval dependencies cannot be silently skipped.
6. Existing OpportunityOS BuildGraph preflight behavior remains intact.
7. The branch can be reviewed independently before merge or activation.