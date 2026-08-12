---
name: verifying-deliverables
description: Use when determining whether generated work actually satisfies requirements, tests, acceptance criteria, source claims, or delivery conditions.
---

# Verifying Deliverables

## Core rule

`EXECUTED` is not `VERIFIED`. Validate independently against the original acceptance contract.

## Verify

- Required outputs exist and are readable.
- Tests, checks, or acceptance procedures pass where applicable.
- Client-facing claims are supported by evidence.
- No required capability or approval gate was skipped.
- Generated artifacts match requested scope and format.
- Evidence identifies the exact artifact/version under review.

## Decision

Return `accepted`, `repair-required`, or `blocked`, with evidence and failing criteria. Never infer successful deployment, delivery, publication, or external action without a receipt proving it.