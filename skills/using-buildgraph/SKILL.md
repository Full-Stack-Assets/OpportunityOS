---
name: using-buildgraph
description: Use before substantial project, feature, architecture, integration, agent, skill, research-program, or reusable-capability work, and whenever multiple tools, approvals, verifiers, or reusable capabilities may apply.
---

# Using BuildGraph

## Overview

BuildGraph is the inherited portfolio control layer for reuse, capability resolution, evidence, and duplicate-work prevention. Treat work as a capability graph, not a loose sequence of tool calls.

Substantial work must not begin until the live BuildGraph registry has produced a policy/preflight result. Routine maintenance may bypass a fresh preflight only while it remains inside the current project/product/architecture boundary.

## Portfolio preflight sequence

Before any substantial project or feature work:

1. Classify the request as `ROUTINE` or `SUBSTANTIAL` using the shared portfolio policy.
2. If `SUBSTANTIAL`, retrieve the live BuildGraph registry and compile knowledge-backed preflight evidence.
3. Record exactly one BuildGraph outcome:
   - `REUSE_EXISTING`
   - `EXTEND_EXISTING`
   - `MERGE_WITH_EXISTING`
   - `FORK_EXISTING`
   - `REFACTOR_EXISTING`
   - `ARCHIVE_DUPLICATE`
   - `CREATE_NEW`
4. Honor the selected route. Never start a parallel implementation when the outcome is reuse, extend, merge, fork, refactor, or archive.
5. Allow `CREATE_NEW` only when registry retrieval succeeded, reusable candidates were evaluated, ambiguity is resolved, and explicit evidence-backed justification is present.
6. Attach and persist a deterministic preflight receipt before substantial implementation begins.
7. If the registry is unavailable or materially ambiguous, stop the substantial work as `REVIEW` / blocked. Registry failure is never permission to create something new.

## Routine maintenance boundary

A fresh preflight is normally unnecessary for narrowly scoped:

- typo or formatting fixes;
- documentation corrections;
- dependency updates that do not alter architecture;
- test repairs inside an existing scope;
- bug fixes that preserve product and architecture boundaries;
- routine maintenance already covered by the current project decision context.

If execution expands scope, creates a reusable capability, introduces a new integration/store/agent/skill, or changes architecture, reclassify the work as `SUBSTANTIAL` before that expansion proceeds.

## Capability resolution sequence

After portfolio preflight selects the project/reuse route:

1. Translate the goal into required capabilities.
2. Resolve dependencies before selecting executors.
3. Mark each capability `available`, `human-gated`, `missing`, or `prohibited`.
4. Stop before any blocked capability; never route around it.
5. Pair consequential execution with its verifier.
6. Do not call a workflow complete until evidence is produced, verified, and accepted.

## Authority boundary

BuildGraph preflight does not grant consequential authority. Marketplace writes, external messages, publication, deployment, credential expansion, destructive actions, payments, signatures, contracts, and legal/financial commitments still require their applicable policy and human-approval gates.

Agents may not route around BuildGraph by renaming duplicate work, creating a parallel repository, or labeling a substantial build as an experiment.

## Required sub-skills

Load only the workflow skills needed by the resolved graph. Use `routing-human-approval` whenever an action requires external, destructive, costly, credentialed, marketplace, publication, payment, or commitment authority. Use `recovering-workflows` after a failed node.

## Output contract

Return the scope classification, BuildGraph outcome, primary canonical target, reuse/extension plan, blockers, human gates, verifier requirements, receipt/evidence references, and completion evidence. Never claim unavailable capability coverage or silently choose `CREATE_NEW`.
