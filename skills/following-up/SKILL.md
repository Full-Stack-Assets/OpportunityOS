---
name: following-up
description: Use when a submitted application, delivered task, client message, approval request, or other workflow state needs a subsequent check or response.
---

# Following Up

## Core rule

Follow-up continues a known workflow; it does not create new commitments or fabricate status.

## Workflow

- Inspect the current authoritative state before drafting or acting.
- Identify what changed since the previous interaction.
- Avoid duplicate messages when a response already exists.
- Preserve the prior scope, pricing, claims, and approval boundaries unless explicitly changed.
- Separate a prepared follow-up from an externally sent follow-up.
- Escalate new scope, payment, contract, publication, or platform commitments through `routing-human-approval`.

## Output

Return current status, meaningful changes, recommended next action, and any prepared follow-up content or authority requirement.