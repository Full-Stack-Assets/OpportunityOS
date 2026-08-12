# BuildGraph Skills + ChatGPT Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable BuildGraph capability registry, ChatGPT skill pack, and MCP workflow plugin surface to OpportunityOS without widening existing execution authority.

**Architecture:** Atomic `SKILL.md` files describe reusable workflow behavior. A deterministic core registry models capability nodes and typed dependencies. One tool-only MCP app exposes the registry to ChatGPT, while thin plugin profiles restrict the shared tool set by workflow family.

**Tech Stack:** Node.js >=22.13.0, TypeScript 6, existing OpportunityOS core contracts, Model Context Protocol, ChatGPT Apps/Plugins conventions.

## Global Constraints

- Preserve the existing fail-closed BuildGraph preflight contract.
- Preserve simulation-only and no-marketplace-write boundaries unless separately authorized.
- Do not let factories, skills, or plugins self-authorize consequential actions.
- Require evidence-backed verification before declaring completion.
- Use trigger-only skill frontmatter descriptions.
- Keep plugin profiles as tool filters, not independent authority sources.

---

### Task 1: BuildGraph capability registry

**Files:**
- Create: `packages/core/src/buildgraph-skills.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/buildgraph-skills.test.mjs`

**Interfaces:**
- Produces: `CapabilityNode`, `CapabilityEdge`, `CapabilityGraph`, `resolveCapabilityGraph(goalId, availableCapabilities)`.
- Consumes: no external services.

- [ ] Write failing tests for dependency resolution, missing capabilities, approval-gated nodes, verifier dependencies, and cycle rejection.
- [ ] Run the focused tests and confirm RED.
- [ ] Implement the minimal deterministic registry and resolver.
- [ ] Run focused and full core tests and confirm GREEN.
- [ ] Export the registry through `packages/core/src/index.ts`.

### Task 2: ChatGPT skill pack

**Files:**
- Create: `skills/*/SKILL.md`
- Create: `skills/README.md`

**Interfaces:**
- Consumes: BuildGraph capability IDs.
- Produces: reusable ChatGPT/Codex skill instructions.

- [ ] Create pressure scenarios for discovery, qualification, fulfillment, verification, approval routing, recovery, and capability-gap learning.
- [ ] Record baseline failure patterns before skill instructions are applied.
- [ ] Add concise trigger-oriented skills that address the observed failures.
- [ ] Re-run pressure scenarios and close remaining loopholes.
- [ ] Verify names, frontmatter limits, cross-references, and token efficiency.

### Task 3: Shared BuildGraph MCP app

**Files:**
- Create: `apps/buildgraph-mcp/package.json`
- Create: `apps/buildgraph-mcp/tsconfig.json`
- Create: `apps/buildgraph-mcp/src/server.ts`
- Create: `apps/buildgraph-mcp/src/tools.ts`
- Create: `apps/buildgraph-mcp/test/tools.test.mjs`

**Interfaces:**
- Produces tools: `buildgraph_list_capabilities`, `buildgraph_resolve_workflow`, `buildgraph_check_readiness`, `buildgraph_verify_completion`, `buildgraph_capability_gaps`.
- Consumes: deterministic core registry only in the first tranche.

- [ ] Write failing contract tests for tool names, schemas, read-only annotations, and structured output.
- [ ] Run focused tests and confirm RED.
- [ ] Implement the smallest tool-only MCP server aligned with current OpenAI Apps/Plugins guidance.
- [ ] Run compile and tool-discovery tests and confirm GREEN.
- [ ] Verify no write-capable tool is exposed in this tranche.

### Task 4: Workflow plugin profiles

**Files:**
- Create: `plugins/buildgraph-discovery/plugin.json`
- Create: `plugins/buildgraph-planner/plugin.json`
- Create: `plugins/buildgraph-fulfillment/plugin.json`
- Create: `plugins/buildgraph-verifier/plugin.json`
- Create: `plugins/buildgraph-delivery/plugin.json`
- Create: `plugins/README.md`

**Interfaces:**
- Consumes: shared MCP server tool IDs.
- Produces: workflow-specific allowlists and authority metadata.

- [ ] Write a schema test requiring every profile to reference only registered tools.
- [ ] Confirm the test fails before profiles exist.
- [ ] Add the five profiles with explicit read/write and approval boundaries.
- [ ] Run schema/contract tests and confirm GREEN.

### Task 5: Integration and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/buildgraph-integration.md`
- Modify: `.github/workflows/*` only if needed for the new workspace tests.

**Interfaces:**
- Consumes: completed registry, skills, MCP app, plugin profiles.
- Produces: documented review and activation path.

- [ ] Document the capability-graph extension without changing the existing preflight authority rule.
- [ ] Add build/typecheck/test coverage for the new app.
- [ ] Run repository tests, typecheck, build, smoke, MCP discovery, and static secret checks.
- [ ] Record exact verification evidence and any unrun checks.
- [ ] Keep the change on a review branch; do not activate or deploy the MCP endpoint automatically.