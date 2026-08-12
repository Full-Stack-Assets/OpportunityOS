---
name: recovering-workflows
description: Use when a capability node, tool call, test, source adapter, approval, deployment check, or other workflow step fails, becomes unavailable, or produces invalid evidence.
---

# Recovering Workflows

## Core rule

Failure is a graph transition, not permission to improvise around controls.

## Workflow

1. Record the failed node and evidence.
2. Classify the failure: transient, dependency, implementation, evidence, policy, approval, source, or unknown.
3. Select only declared `REPAIRS` or `FALLBACK_TO` paths.
4. Do not retry non-idempotent/consequential actions unless their state is known safe.
5. Re-run the affected verifier after repair.
6. Escalate unresolved or authority-related failures rather than weakening requirements.

## Output

Return failure class, evidence, selected recovery path, retry safety, and final state. Never convert an unknown outcome into success.