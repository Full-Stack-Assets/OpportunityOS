# OpportunityOS — CIM-lite

**Audience:** corporate development / product strategy.  
**Date:** 2026-08-19  
**Repository head described:** `main` @ `6903279` (Merge PR #19, public-demand collectors).  
**Release:** `0.1.0-simulation`  
**This is not a CIM from a bank, not a valuation, and not a representation of revenue.**

---

## 1. Transaction thesis

Full Stack Assets offers a **carve-out**: the OpportunityOS repository and associated governed-agent IP, with founder continuity. It is a **strategic IP + acquihire** process.

It is **not** a SaaS recapitalization. There is no claimed ARR, no production customer list, and no live consequential marketplace product.

The buyer should already own demand, talent supply, or an agent runtime. OpportunityOS supplies the missing **evidence → authority → verification** path so agents cannot silently bid, message, or mark work complete.

## 2. Seller and perimeter

See [asset-perimeter.md](asset-perimeter.md).

- Seller: Full Stack Assets (Nic Albertson)
- Asset: `github.com/Full-Stack-Assets/OpportunityOS`
- Out: games, music, web-estate, rental plans, and other studio repos
- Name collision: an unrelated Atlanta LinkedIn practice also uses “OpportunityOS” — [ip-and-name.md](ip-and-name.md)

## 3. Product

Governed path (from [docs/architecture/overview.md](../architecture/overview.md)):

`SOURCE → EVIDENCE → RANK → BUILDGRAPH PREFLIGHT → POLICY/APPROVAL → WORKORDER → FACTORY → INDEPENDENT VERIFICATION → RECEIPT → ECONOMICS`

Security domains are separated: source adapters cannot invent evidence; seller listings cannot become buyer demand; factories cannot self-authorize; verifiers are independent of factory output.

### Shipped on `main`

- Canonical JSON + SHA-256 hashing
- Payload-bound, action-specific, expiring approvals and chained receipts
- Marketplace `record_kind`: `buyer_opportunity` vs `service_listing`
- Freelancer read-only official-API MCP adapter
- Fiverr read-only public-web MCP adapter (listings only; fail-closed on anti-bot/schema drift)
- GitHub Issues and Hacker News official-API collectors with collector receipts
- Commercial Intelligence Engine: economic-amount semantics, P0 / P0-Critical ($1M USD budget or recoverable loss), eligibility, uncalibrated winability, revalidation windows, Critical Investigation Packets
- `READY_FOR_HUMAN_REVIEW` never sets `externalActionAllowed` to true
- WorkOrder FSM including `NEEDS_YOU`
- Simulation factories (Software/Web, Research/Documents, Automation)
- Independent artifact checksum verification
- Integer-cent economics; unknowns remain undefined
- Next.js control-plane scaffold (synthetic preview, labeled as such)
- Read-only BuildGraph MCP (5 tools) and 5 plugin profiles

### Deliberately not shipped

- Live execution / provider writes
- Worker as a queue consumer or daemon
- Full Postgres adapter (schema exists; store is WorkOrder put/get)
- Remaining catalog collectors (Reddit, GitHub Discussions, DEV, Discourse, Indie Hackers)
- Production signature/identity provider (verifier is injected)
- Authenticated live BuildGraph round-trip
- Write-capable MCP tools

## 4. Why this is hard to rebuild quickly

Most agent demos optimize for “it applied.” This kernel optimizes for **admissible evidence**:

- Retrieval failure yields zero verified records, not a synthetic opportunity.
- Fiverr cannot satisfy `isBuyerOpportunityEvidence()`.
- A `$1.4M` recoverable loss stays exposure; it does not become a `$1.4M` contract.
- P0-Critical means mandatory investigation, not autonomous pursuit.
- Completion requires independent verification and a receipt chain.

Those invariants are encoded in TypeScript/Python tests, not only in prose.

## 5. Architecture (buyer view)

```text
Freelancer / Fiverr / GitHub / HN
        │  read-only adapters & collectors
        ▼
Verified evidence + record_kind
        ▼
Demand intelligence + Commercial Intelligence Engine
        ▼
READY_FOR_HUMAN_REVIEW / NOT_READY
        X  externalActionAllowed = false
        ▼
BuildGraph preflight (CREATE_NEW or NEEDS_YOU)
        ▼
Trust Kernel approval
        ▼
Simulation factory → independent verifier → receipts
```

Libraries exist; a continuous production orchestrator does **not**. Integration is proven by tests and `npm run smoke`, not a live service mesh.

## 6. Security and residual risk

From [docs/architecture/threat-model.md](../architecture/threat-model.md):

**Controls:** approval replay (hash + expiry + signature), factory isolation, mandatory BuildGraph preflight, independent checksums, chained receipts, integer-cent economics, simulation-only schema check, secrets not committed.

**Residual risks a buyer must underwrite:**

- Signature verification is injected; no production identity provider is activated.
- PostgreSQL live migration is an operations gate, not a completed production binding.
- BuildGraph live API authentication is environment-dependent and not claimed active.
- Fiverr HTML parsing is inherently brittle (correctly fail-closed, limited production value).
- Win probability is `UNCALIBRATED_V1`.
- Control plane shows synthetic pipeline counts labeled as preview.
- `.env.example` contains a public Amplitude analytics key for the Pages demo (not a secret credential for provider writes).
- `package-lock.json` has historically been a CI artifact rather than a committed lockfile (this tranche commits one for reproducibility).
- No `LICENSE` file; assignment documents must state copyright transfer.

## 7. Evidence of work (not evidence of traction)

As of 2026-08-19 on `main` @ `6903279`, locally:

- Node behavioral suite + plugin guard: **133 tests passed**, 5 read-only MCP tools verified
- Python connector tests: **57 passed**
- Smoke: `COMPLETED`, verified `true`, `SIMULATION`, `externalSideEffects = 0`, 3 receipts
- Buyer demo: `npm run demo` (same simulation invariants + P0-Critical packet with `externalActionAllowed: false`)

CI workflow: `.github/workflows/ci.yml` (install, Node tests, pytest, typecheck, smoke, build).

See [verification-report.md](../../verification-report.md) and [docs/architecture/release-evidence.md](../architecture/release-evidence.md).

## 8. Unmerged work (optional upside)

Do not describe these as current product:

- PR #10 (draft) — aggregator post-merge verification leftover
- PR #16 (open, dirty vs `main`) — BuildGraph unified knowledge v0.1
- PR #22 (draft) — Agentic Fabric Unit 1 registry

## 9. Commercial model for a buyer (not current revenue)

Post-close, the natural models sit **inside the acquirer**:

- Enterprise compliance feature on a freelance marketplace (governed agentic apply)
- GitHub/Copilot issue-to-WorkOrder with reuse preflight
- Agent-platform Trust Kernel for tool writes
- Procurement investigation packets (P0-Critical) without autonomous outreach

OpportunityOS today has **no independent go-to-market or billed customers**.

## 10. Ask and process

- **Structure:** asset purchase of the defined perimeter + employment/consulting continuity for the founder
- **Process:** founder-led; boutique advisor only after a second inbound
- **First meeting:** 20 minutes; demo script in [demo-script.md](demo-script.md)
- **Do not ask this seller to enable marketplace writes** as a proof point; that increases ToS risk and reduces acquirer interest until the buyer owns the provider relationship

## 11. Contacts

- hello@fullstackassets.com
- GitHub: @Full-Stack-Assets
