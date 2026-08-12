---
name: executing-fulfillment
description: Use when an approved fulfillment plan is ready to execute through software, research, design, data, content, or other task-producing capabilities.
---

# Executing Fulfillment

## Core rule

Execute only nodes that are READY: prerequisites satisfied, required authority present, evidence current, and no blocking policy state.

## Workflow

- Follow the resolved graph rather than improvising a new scope.
- Use the smallest capable executor for each node.
- Preserve artifacts and receipts produced by execution.
- Do not treat executor output as verification evidence by itself.
- Stop before external writes or commitments lacking explicit authority.
- On failure, transition to `recovering-workflows`; do not silently retry consequential actions.

## Completion

Execution produces a candidate deliverable and evidence. It does not establish final acceptance; use `verifying-deliverables`.