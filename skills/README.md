# OpportunityOS BuildGraph Skills

These skills are reusable ChatGPT/Codex workflow capabilities. They are intentionally atomic: agents should load only the skills required by the resolved BuildGraph path.

## Routing and governance

- `using-buildgraph` — capability/dependency routing for multi-step work.
- `routing-human-approval` — payload-bound authority for consequential actions.
- `recovering-workflows` — fail-closed repair/fallback routing.

## Opportunity lifecycle

- `discovering-opportunities`
- `qualifying-opportunities`
- `researching-opportunities`
- `preparing-applications`
- `following-up`

## Fulfillment lifecycle

- `planning-fulfillment`
- `executing-fulfillment`
- `verifying-deliverables`
- `preparing-client-delivery`

## Evidence and improvement

- `verifying-claims`
- `learning-capability-gaps`

## Completion invariant

`EXECUTED -> EVIDENCE_PRODUCED -> VERIFIED -> ACCEPTED`

No skill grants itself additional authority. Existing OpportunityOS source-evidence, BuildGraph preflight, policy, approval, and verification boundaries remain controlling.