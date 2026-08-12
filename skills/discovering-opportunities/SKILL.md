---
name: discovering-opportunities
description: Use when finding, ingesting, normalizing, or deduplicating freelance, contract, task, or project opportunities from one or more marketplaces or source feeds.
---

# Discovering Opportunities

## Core rule

Source facts must remain source facts. Never manufacture a verified opportunity after an upstream failure.

## Workflow

- Query only authorized/readable sources.
- Preserve source platform, source ID, source URL, retrieval method, and retrieval time.
- Normalize fields without inventing missing values.
- Deduplicate using stable source identifiers first; use fuzzy matching only as a secondary signal.
- Mark malformed, unavailable, or unverified records explicitly and exclude them from verified intake.
- Produce evidence that downstream qualification can inspect.

## Output

Return normalized opportunities plus source-evidence status and retrieval failures. Discovery does not bid, message, accept work, create milestones, or make commitments.