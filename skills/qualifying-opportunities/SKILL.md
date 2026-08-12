---
name: qualifying-opportunities
description: Use when deciding whether an opportunity is worth pursuing based on capability coverage, effort, risk, evidence quality, economics, competition, or human intervention.
---

# Qualifying Opportunities

## Core rule

Prefer opportunities with a complete, verifiable execution path over opportunities that merely look attractive.

## Evaluate

- Required capability coverage.
- Autonomous versus human-gated coverage.
- Missing or prohibited capabilities.
- Verification coverage.
- Estimated effort and delivery complexity.
- Economic attractiveness and downside risk.
- Source-evidence quality.
- Platform or client constraints.

## Decision

Return `pursue`, `needs-human-review`, or `reject`, with the capability path and blockers. Do not convert unknowns into optimistic assumptions. A high-value task with an incomplete execution graph may rank below a smaller task with end-to-end coverage.