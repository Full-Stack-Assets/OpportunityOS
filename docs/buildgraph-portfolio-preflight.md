# BuildGraph Portfolio-Wide Preflight

BuildGraph preflight is the shared portfolio gate for substantial work. It prevents parallel reinvention by checking the canonical registry before a new project, product surface, architecture layer, integration, agent, skill, research program, or reusable capability is created.

## Central policy

Every canonical project inherits:

- `preflightRequired = true`
- `routineBypassAllowed = true`

The database migration installs inheritance at the `knowledge_entities` boundary. Newly inserted project entities receive a default row in `knowledge_project_policies`. The trigger uses `ON CONFLICT DO NOTHING`, so a recorded stricter policy or governance exemption is never silently overwritten.

Project-specific exemptions require an explicit governance decision reference. Missing policy is not permission to bypass the gate.

## Scope classification

### SUBSTANTIAL

A fresh BuildGraph preflight is mandatory for:

- a new project or repository;
- a new product or major product surface;
- a material feature or refactor;
- a new architecture layer;
- a new database or persistent store;
- a new integration, agent, skill, plugin, or MCP server;
- a reusable framework, component, factory, or capability;
- a research program intended to create reusable capability;
- a fork, replacement, or redesign that may overlap existing work.

A task is also substantial whenever `changesArchitecture` or `createsReusableCapability` becomes true during execution.

### ROUTINE

Routine work may bypass a fresh preflight when it remains within an existing boundary, including:

- typo/formatting changes;
- documentation corrections;
- non-architectural dependency updates;
- test repairs;
- narrow bug fixes;
- ordinary maintenance already covered by current project decisions.

A routine task that expands scope must stop before the expansion and re-enter the portfolio preflight path as `SUBSTANTIAL`.

## Fail-closed decisions

Substantial work follows this sequence:

```text
work request
  -> classify ROUTINE / SUBSTANTIAL
  -> live registry retrieval
  -> knowledge-backed BuildGraph preflight
  -> portfolio policy evaluation
  -> reuse decision or blocked review
  -> deterministic receipt
  -> implementation
```

The allowed BuildGraph outcomes are:

- `REUSE_EXISTING`
- `EXTEND_EXISTING`
- `MERGE_WITH_EXISTING`
- `FORK_EXISTING`
- `REFACTOR_EXISTING`
- `ARCHIVE_DUPLICATE`
- `CREATE_NEW`

`CREATE_NEW` is exceptional. It requires successful registry retrieval, verified absence of a material reusable candidate, resolved ambiguity, consideration of archived/superseded candidates, rejected reuse alternatives, and a non-empty evidence-backed justification.

Registry unavailable means blocked. Strong ambiguity means review. A reuse candidate means the selected existing path is mandatory. None of these conditions can be converted into permission to create a parallel project.

## Receipt contract

Every substantial policy evaluation must be represented by a durable receipt with:

- receipt ID and deterministic hash;
- work/request ID;
- scope classification;
- policy outcome/reason;
- BuildGraph decision when available;
- primary canonical project when available;
- explicit justification when `CREATE_NEW` is selected;
- referenced project, constraint, and decision evidence;
- generation timestamp.

The persistence layer stores receipts in `knowledge_preflight_receipts`. Deterministic replay is idempotent. An ID collision with a different receipt hash is not silently rewritten.

## Lightweight adapters

Projects do not embed their own BuildGraph implementations. A repository that has an orchestrator, agent bootstrap, project-init path, or CI gate should call the shared BuildGraph policy/preflight surface.

A compliant adapter does only three things:

1. describe the proposed work using the shared scope contract;
2. obtain the shared portfolio preflight decision and receipt;
3. refuse to proceed when the decision is blocked or routes work to an existing canonical target.

Decision logic remains centralized. Repository adapters must not reinterpret `CREATE_NEW`, weaken ambiguity handling, or invent alternate reuse rules.

Repositories without an executable adapter are still governed by the central registry policy and the agent-facing `using-buildgraph` contract. Missing adapter coverage is recorded as a capability gap, not assumed away.

## MCP surface

`buildgraph_compile_knowledge_preflight` compiles registry evidence.

`buildgraph_evaluate_portfolio_preflight` applies the deterministic inherited portfolio policy to already-compiled evidence.

Both MCP tools are read-only. They do not persist receipts or mutate external sources. Persistence is a separate trusted database operation after evaluation.

## Authority boundary

Portfolio preflight grants no external authority. It cannot authorize:

- marketplace applications or proposals;
- external emails/messages;
- publication;
- production deployment;
- credential expansion;
- destructive deletion/archival;
- payments or purchases;
- signatures or contracts;
- legal or financial commitments.

Those actions continue through their existing Trust Kernel/policy/human-approval gates.

## Future project invariant

A newly registered canonical project automatically inherits the portfolio policy at the database boundary. It remains gated unless a specific evidence-backed governance decision records an exemption.

This keeps BuildGraph a substrate-level rule rather than a prompt convention that an individual agent can forget.
