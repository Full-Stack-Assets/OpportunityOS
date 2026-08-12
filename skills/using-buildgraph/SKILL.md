---
name: using-buildgraph
description: Use when a task may require multiple tools, agents, approvals, verifiers, or reusable capabilities and the correct execution path is not obvious.
---

# Using BuildGraph

## Overview

Treat work as a capability graph, not a loose sequence of tool calls. Resolve prerequisites, authority, verification, and recovery paths before execution.

## Required sequence

1. Translate the goal into required capabilities.
2. Resolve dependencies before selecting executors.
3. Mark each capability `available`, `human-gated`, `missing`, or `prohibited`.
4. Stop before any blocked capability; never route around it.
5. Pair consequential execution with its verifier.
6. Do not call a workflow complete until evidence is produced, verified, and accepted.

## Required sub-skills

Load only the workflow skills needed by the resolved graph. Use `routing-human-approval` whenever an action requires external, destructive, costly, credentialed, marketplace, publication, payment, or commitment authority. Use `recovering-workflows` after a failed node.

## Output contract

Return the selected capability path, blockers, human gates, verifier requirements, and evidence needed for completion. Never claim unavailable capability coverage.