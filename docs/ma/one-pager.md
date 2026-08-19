# OpportunityOS — one-pager

**Confidential. Not an offer. Not a claim of revenue, customers, or live marketplace execution.**

## Problem

Agent and marketplace automation demos skip the part that gets companies sued or banned: **evidence, authority, and audit**. Teams that already own demand (freelance platforms, GitHub, Copilot/agent runtimes) need a kernel that can discover and rank work **without** fabricating facts or firing bids.

## What this is

OpportunityOS is a **governed commercial-agent kernel** (release `0.1.0-simulation`) that:

1. Admits only verified source evidence, with `buyer_opportunity` vs `service_listing` kept distinct.
2. Ranks and investigates demand (including P0-Critical seven-figure signals) **without authorizing outreach**.
3. Requires BuildGraph reuse preflight before new work.
4. Executes only simulation WorkOrders behind payload-bound, expiring approvals.
5. Independently verifies artifacts and chains receipts. Unknown money stays unknown.

**Moat (today):** fail-closed contracts and tests, not network effects. The product stops at `READY_FOR_HUMAN_REVIEW` with `externalActionAllowed = false`.

## What ships on `main`

- Trust Kernel, WorkOrder FSM, DAG compiler, simulation factories, independent verifier
- Read-only Freelancer (official API, buyer demand) and Fiverr (public web, listings only)
- GitHub Issues + Hacker News official-API collectors
- Commercial Intelligence Engine (P0 / P0-Critical, eligibility, uncalibrated winability)
- Read-only BuildGraph MCP tools + ChatGPT skills/plugins
- PostgreSQL schema; WorkOrder store is minimal
- CI: 133 Node tests, 57 Python tests, smoke `COMPLETED` / `externalSideEffects = 0`

## What does not ship

- No ARR, logos, or production users
- No live bids, messages, payments, or deployments
- Control plane preview uses labeled synthetic records
- Win probability is explicitly `UNCALIBRATED_V1`
- Live Postgres migration and live BuildGraph round-trip remain environment gates

## Why a platform would buy it

A tuck-in of **policy + provenance** for agentic pursuit or issue-to-work routing, rather than building a second Trust Kernel. Founder continuity is part of the package.

## Ask

**Asset purchase of the perimeter in [asset-perimeter.md](asset-perimeter.md) plus founder continuity (acquihire-shaped).** Twenty minutes with corporate development or product strategy. Demo: `npm run smoke` and `npm run demo` — simulation only.

**Seller:** Full Stack Assets / Nic Albertson — hello@fullstackassets.com
