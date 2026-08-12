---
name: routing-human-approval
description: Use when a workflow reaches an external write, destructive action, payment, contract, marketplace commitment, publication, credential-sensitive operation, or other consequential step requiring human authority.
---

# Routing Human Approval

## Core rule

A capability can be technically available while still lacking authority. Do not confuse capability with permission.

## Workflow

- Identify the exact consequential action and payload.
- Bind approval to that action, target, scope, and expiry when supported.
- Preserve platform-native confirmation prompts and required identity checks.
- Reject approvals that are stale, ambiguous, for a different payload, or outside the approver's authority.
- Never let the executor approve its own consequential action when separation of duties is required.
- Resume only the specifically approved node after approval.

## Output

Return `approved`, `review-required`, `denied`, `expired`, or `invalidated`, plus the action/payload the decision covers. Do not broaden approval by inference.