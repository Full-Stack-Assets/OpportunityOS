---
name: verifying-claims
description: Use when a proposal, case study, application, report, delivery note, or status update contains factual claims about capabilities, metrics, customers, integrations, deployment, users, outcomes, or completion.
---

# Verifying Claims

## Core rule

A claim is publishable only when supported by evidence or explicitly labeled as a proposal, estimate, synthetic example, or unverified statement.

## Workflow

- Extract material factual claims.
- Map each claim to source evidence, repository evidence, execution receipts, or user-provided facts.
- Reject unsupported metrics, customers, URLs, integrations, production status, deployment status, and outcomes.
- Preserve uncertainty rather than upgrading it to certainty.
- Keep promotional/concept imagery separate from live-product evidence.

## Output

Return `supported`, `qualified`, or `unsupported` per claim, plus the evidence boundary and corrected wording when qualification is required.