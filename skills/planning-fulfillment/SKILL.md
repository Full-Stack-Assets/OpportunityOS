---
name: planning-fulfillment
description: Use when a qualified client task needs to be decomposed into executable capabilities, dependencies, acceptance criteria, evidence requirements, and human gates before work begins.
---

# Planning Fulfillment

## Core rule

Plan backward from acceptance. Every execution node needs prerequisites, outputs, verifier, and recovery path.

## Workflow

1. Compile requirements into explicit acceptance criteria.
2. Resolve the capability subgraph with BuildGraph.
3. Topologically order prerequisites.
4. Mark missing, human-gated, and prohibited nodes.
5. Bind each consequential action to approval requirements.
6. Pair deliverable-producing nodes with independent verification.
7. Define failure and fallback transitions before execution.

## Output

Return the ordered capability graph, acceptance criteria, blockers, approval gates, verifier assignments, and required evidence. Do not start execution through unresolved blockers.