# BuildGraph ChatGPT Plugin Profiles

OpenAI's current plugin/app model is built around skills plus MCP servers, with optional UI. OpportunityOS uses one shared tool-only MCP server at `apps/buildgraph-mcp` and thin workflow profiles here to define which tool surface belongs to each ChatGPT workflow.

These JSON files are repository-local registration descriptors. They do not create new authority. When registered as ChatGPT apps/connectors, each profile should point at the same deployed `/mcp` endpoint and expose only its allowlisted tools.

## Profiles

- `buildgraph-discovery` — source/capability inspection for opportunity intake.
- `buildgraph-planner` — graph resolution and readiness checks.
- `buildgraph-fulfillment` — fulfillment planning/readiness and completion checks.
- `buildgraph-verifier` — evidence and completion verification.
- `buildgraph-delivery` — delivery readiness and final verification.

## Shared MCP tools

- `buildgraph_list_capabilities`
- `buildgraph_resolve_workflow`
- `buildgraph_check_readiness`
- `buildgraph_verify_completion`
- `buildgraph_capability_gaps`

All tools in this first release are read-only. Marketplace submissions, client sends, payments, publication, deployment, and other consequential writes remain outside this MCP app until a separately reviewed write-capable tranche is implemented with payload-bound approval gates.