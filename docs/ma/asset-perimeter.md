# Asset perimeter

**Status:** Recommended carve-out for a strategic IP / acquihire process.  
**Not a priced valuation. Not a claim of revenue, customers, or live marketplace execution.**

This document defines what is in the sale package and what is not. Shop this perimeter only. Do not bundle the Full Stack Assets studio as a whole.

## Seller

- **Operating name:** Full Stack Assets
- **Founder:** Nic Albertson (Fall River, Massachusetts)
- **Public site:** https://fullstackassets.com/
- **GitHub org:** https://github.com/Full-Stack-Assets
- **Primary repository:** https://github.com/Full-Stack-Assets/OpportunityOS
- **Contact:** hello@fullstackassets.com

The public site currently positions the founder as a hireable product engineer and scoped client builder. That is consistent with an **IP assignment plus founder continuity** transaction, not a SaaS revenue-multiple sale.

## In perimeter (this repository)

The recommended asset is the **governed commercial-agent kernel** in `Full-Stack-Assets/OpportunityOS` at release `0.1.0-simulation`.

| Area | Path | What a buyer receives |
|---|---|---|
| Deterministic core | `packages/core` | Trust Kernel, WorkOrder FSM, requirements DAG, ranking, source `record_kind`, public-demand intelligence, Commercial Intelligence Engine, BuildGraph preflight gate, simulation factories, independent verifier, integer-cent economics |
| Persistence boundary | `packages/postgres`, `database/migrations/001_initial.sql` | Canonical PostgreSQL schema (9 tables) and a minimal parameterized WorkOrder store |
| Public-demand collectors | `packages/public-demand-collectors` | Read-only GitHub Issues and Hacker News official-API collectors, receipts, fail-closed health states |
| Freelancer adapter | `connectors/freelancer` | Read-only MCP Python SDK v2 buyer-opportunity adapter (`record_kind: buyer_opportunity`) |
| Fiverr adapter | `connectors/fiverr` | Read-only public-web service-listing adapter (`record_kind: service_listing`; cannot enter buyer execution) |
| Worker | `apps/worker` | Simulation-safe WorkOrder prepare/execute library |
| Control plane | `apps/control-plane` | Next.js operator/marketing shell (synthetic preview data; not live operator data) |
| BuildGraph MCP | `apps/buildgraph-mcp`, `plugins/`, `skills/` | Read-only MCP tools, ChatGPT plugin profiles, atomic skills |
| Architecture docs | `docs/architecture`, `docs/commercial-intelligence-engine.md`, `docs/public-demand-collectors.md` | Threat model, operations gates, evidence matrix, CIE contract |
| Verification | `.github/workflows/ci.yml`, `scripts/smoke.ts` | CI plus zero-side-effect smoke run |

BuildGraph in this repo is the **preflight client, capability graph, and MCP/skill surface**. It is not a separately deployed production BuildGraph service.

## Optional upside (not claimed as shipped)

These exist as **open, unmerged pull requests** on the same repository. They must not be represented as part of `main` until they merge.

| PR | Title | Role in diligence |
|---|---|---|
| [#10](https://github.com/Full-Stack-Assets/OpportunityOS/pull/10) | Complete opportunity aggregator post-merge verification | Draft leftover verification; aggregator already on `main` via earlier merge |
| [#16](https://github.com/Full-Stack-Assets/OpportunityOS/pull/16) | BuildGraph unified knowledge v0.1 | GitHub-first Knowledge Inbox contracts; mergeable upside, currently dirty vs `main` |
| [#22](https://github.com/Full-Stack-Assets/OpportunityOS/pull/22) | Agentic Fabric Unit 1: canonical architecture registry | Draft serial unit; do not merge until later fabric units complete |

Issue [#11](https://github.com/Full-Stack-Assets/OpportunityOS/issues/11) is the execution anchor for unified knowledge / BuildGraph v0.1. Treat it as roadmap, not product.

## Out of perimeter

Do **not** include the following Full Stack Assets work unless a buyer explicitly expands the deal:

- Songforge OS, Aetheria, BLAIZE SUNDAY, AI-Agentic-Musicians
- Photobeam, The Narrows, MoviesRule.com, Astrokobi.com, Nextgengear.cc, TheTunerDepot.com
- Inflatable rental business plan
- Wedding Quote Concierge
- Worldline Explorer / Temporal Drift
- Unrelated publishing sites operated by BeyondMythos (41-site estate)
- HostGraph, SupplierWatch, RunwaySignal, DealDiligence, Tradewind Dealflow, PQC Discovery, CMAPSS, and other declared inventory items that are not this repository
- Personal hireable-engineer positioning on fullstackassets.com as a services book of business (no claimed recurring revenue to assign)

Those assets would widen IP, trademark, and product-dilution risk without strengthening the governed-agent thesis.

## Third-party and ToS posture

- Freelancer retrieval uses the **official API** and is **read-only**. No bids, messages, milestones, or payments.
- Fiverr retrieval uses the **public web** and is **fail-closed**. It does not bypass anti-bot/Cloudflare controls, use browser-session secrets, or treat listings as buyer demand.
- GitHub Issues and Hacker News collectors use **official APIs** only. No HTML fallback, posting, or commenting.
- Marketplace writes, outreach, applications, contract acceptance, and payments are **disabled** in this release (`OPPORTUNITYOS_EXECUTION_MODE=simulation`).
- Third-party runtime libraries (Next.js, React, Amplitude, MCP SDKs, Express, Zod, requests, BeautifulSoup) remain under their own licenses. See [ip-and-name.md](ip-and-name.md).

## License posture of this repository

There is **no `LICENSE` file** in the repository as of the `main` head used for this package (`6903279`). Treat source as all-rights-reserved by the copyright holder until an assignment or inbound license is executed. Do not tell a buyer the code is MIT/Apache unless a license is added and the assignment documents match.

## What is explicitly not sold

- Production deployment, DNS, or hosted runtime
- Provider OAuth tokens or customer data (none are stored in this repository)
- A live bidding, messaging, or payments product
- The Atlanta LinkedIn consulting entity that also uses the name “OpportunityOS” (unrelated; see [ip-and-name.md](ip-and-name.md))
