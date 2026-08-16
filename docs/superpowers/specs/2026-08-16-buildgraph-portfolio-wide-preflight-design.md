# BuildGraph Portfolio-Wide Automatic Preflight Design

## Status

Approved direction: make BuildGraph automatic across the portfolio as a hard gate for substantial new work and material expansion, while exempting routine maintenance that does not create or materially change product/architecture scope.

## Goal

Make BuildGraph the default control layer for every existing and future project so substantial work cannot begin without a verified reuse decision.

The required outcomes remain:

- `REUSE_EXISTING`
- `EXTEND_EXISTING`
- `MERGE_WITH_EXISTING`
- `FORK_EXISTING`
- `REFACTOR_EXISTING`
- `ARCHIVE_DUPLICATE`
- `CREATE_NEW`

`CREATE_NEW` is exceptional and requires evidence-backed justification.

## Architecture

Use three enforcement layers rather than duplicating BuildGraph logic across every repository.

### 1. Central registry policy

Every canonical active project receives a portfolio policy indicating that BuildGraph preflight is required for substantial work.

Policy evaluation lives in BuildGraph/OpportunityOS and consumes the live registry. Existing and future projects inherit the same rule by default.

### 2. Shared preflight client / gate

Extend the existing BuildGraph preflight contract with a portfolio policy evaluator:

- classify proposed work as `ROUTINE` or `SUBSTANTIAL`;
- require a registry-backed preflight for `SUBSTANTIAL` work;
- permit `ROUTINE` work without a fresh preflight when it stays inside an already-known project boundary;
- block new creation when registry state is unavailable or materially ambiguous;
- persist a receipt for every substantial preflight decision.

The existing `decideBuildStart()` fail-closed behavior remains authoritative for new creation.

### 3. Lightweight project adapters

Projects do not receive independent BuildGraph implementations. Where a repository has an orchestrator, CI workflow, agent bootstrap, or project-init path, add a thin adapter that calls the shared policy/preflight layer before substantial work begins.

Repositories without an executable automation entrypoint are still covered by the central registry policy and agent-level preflight contract.

## Trigger rules

Preflight is mandatory for:

- creating a repository or project;
- adding a new product or major product surface;
- material feature expansion;
- new architecture layers;
- new databases or persistent stores;
- new agents, skills, plugins, MCP servers, or integrations;
- new reusable components/factories/frameworks;
- substantial redesigns;
- new research programs intended to produce reusable project capability;
- forking or replacing an existing system;
- work that could plausibly duplicate another project or capability.

Fresh preflight is not required for routine work such as:

- typo/documentation fixes;
- formatting changes;
- dependency updates that do not change architecture;
- test repairs inside an existing scope;
- bug fixes that preserve product boundaries;
- routine maintenance already covered by the current project decision context.

If a supposedly routine task materially expands scope during execution, it must be reclassified to `SUBSTANTIAL` before that expansion proceeds.

## Receipt contract

Every substantial preflight creates a durable receipt containing:

- request ID;
- project/request summary;
- classification (`SUBSTANTIAL`);
- registry availability;
- retrieved candidates;
- selected BuildGraph decision;
- primary canonical target;
- reuse/extension plan;
- rejected alternatives;
- duplication/waste risk;
- decision/constraint evidence references;
- justification for `CREATE_NEW`, if selected;
- timestamp and deterministic payload hash.

## `CREATE_NEW` requirements

`CREATE_NEW` is allowed only when all of the following hold:

1. Registry retrieval succeeded.
2. No active reusable project/capability satisfies the requirement at a material level.
3. Strong ambiguous matches have been resolved or explicitly reviewed.
4. Archived/superseded matches have been considered.
5. Reuse, extend, merge, fork, and refactor alternatives are documented as insufficient.
6. The receipt records explicit new-build justification.

Registry failure or ambiguity can never become implicit permission to create something new.

## Fail-closed behavior

- Registry unavailable -> `BUILDGRAPH_PREFLIGHT_REQUIRED` / block substantial creation or expansion.
- Strong ambiguous canonical matches -> `REVIEW` / block new creation.
- Existing reusable candidate -> require the selected reuse/extend/merge/fork/refactor path.
- Archived-only strong candidate -> `REVIEW` before new creation.
- Missing evidence -> lower confidence or block; never fabricate coverage.

Routine maintenance may continue if it does not depend on the unavailable registry and does not cross the substantial-work boundary.

## Agent behavior

Every participating agent/orchestrator must treat the BuildGraph gate as inherited policy rather than optional prompt guidance.

Before substantial work, the agent must:

1. classify scope;
2. retrieve BuildGraph context;
3. compile preflight evidence;
4. honor the selected reuse decision;
5. attach the preflight receipt to the work context;
6. stop before any blocked/human-gated capability.

Agents may not route around the gate by changing project names, creating a parallel repository, or describing duplicate work as an experiment.

## Portfolio rollout

The rollout must avoid 94 bespoke repository patches.

Phase 1:
- add the portfolio policy evaluator and receipt contract to BuildGraph core;
- mark active canonical projects `preflight_required` in the registry;
- update the `using-buildgraph` skill so substantial work always invokes the gate;
- expose a read-only MCP check for policy/preflight state.

Phase 2:
- add reusable CI/agent bootstrap hooks for repositories that already use automated project-init or fulfillment flows;
- create a standard adapter template for future repositories;
- add a project-registration invariant so newly registered projects inherit `preflight_required=true` unless explicitly exempted by a recorded governance decision.

Phase 3:
- audit the portfolio for automation entrypoints and verify coverage;
- record exceptions and missing hooks as BuildGraph capability gaps rather than silently assuming coverage.

## Security and authority

This feature does not grant new external authority.

- BuildGraph retrieval/preflight remains read-only against source systems.
- Registry writes are limited to policy state and receipts.
- No merge, deployment, message send, payment, publication, credential expansion, or destructive action is authorized by preflight alone.
- Existing approval/human-gate rules remain in force.

## Testing

Required tests:

- routine task bypasses fresh preflight;
- substantial task requires preflight;
- scope escalation from routine to substantial re-triggers the gate;
- unavailable registry blocks substantial creation;
- ambiguous strong match blocks `CREATE_NEW`;
- active matching project produces reuse/extend outcome;
- archived-only match routes to review;
- `CREATE_NEW` requires explicit justification and a receipt;
- every substantial preflight persists a deterministic receipt;
- newly registered projects inherit the required policy;
- no preflight action grants consequential external authority;
- project adapters call the shared implementation rather than duplicating decision logic.

## Completion criteria

This change is complete when:

1. portfolio policy is represented in the live registry;
2. BuildGraph core can classify `ROUTINE` vs `SUBSTANTIAL` work;
3. substantial work is fail-closed behind registry-backed preflight;
4. `CREATE_NEW` requires explicit evidence-backed justification;
5. receipts are durable and queryable;
6. the BuildGraph skill and MCP surface expose the automatic behavior;
7. newly registered projects inherit the gate automatically;
8. representative existing projects demonstrate adapter coverage;
9. repository tests/typecheck/smoke/build gates pass;
10. no external authority boundary is weakened.
