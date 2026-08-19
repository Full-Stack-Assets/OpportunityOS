# Buyer map

**Use:** named desks, one thesis each, why this is not a competing marketplace, and what to demo.  
**Do not send email until [founder-checklist.md](founder-checklist.md) is complete.**  
**Do not use support inboxes. Prefer Corporate Development / Corporate Strategy / M&A, reached via public IR where needed.**

## Tier A

### 1. Fiverr — Corporate Development

- **Thesis:** Seller-side market intelligence plus a fail-closed agent policy layer. Fiverr records in OpportunityOS are already `service_listing` and cannot create client WorkOrders.
- **Why not a competitor:** No Fiverr write tools, no anti-bot bypass, no gig purchase path.
- **Why they might care:** Agent features that spam buyers or violate ToS are an existential risk; this kernel is built to stop before that.
- **Demo:** Fiverr connector README + `record_kind` test narrative; investigation packet never authorizes outreach.
- **Public route:** [IR contact](https://investors.fiverr.com/more/contact-us) `investors@fiverr.com`. Ask IR to introduce corporate development. Fiverr’s Q4'25 shareholder letter assigns M&A leadership to President Ofer Katz. Do not use fiverr.com/support.
- **Do not say:** “We bid on Fiverr” or “we bypass Cloudflare.”

### 2. Freelancer.com — Corporate Development / partnerships

- **Thesis:** Demand qualification and bid-governance in front of the official API. Canonical `buyer_opportunity` adapter is already Freelancer-shaped.
- **Why not a competitor:** Read-only search/profile/OAuth URL only. No bids, messages, milestones, payments.
- **Why they might care:** Enterprise clients need audit trails for any future assisted bidding.
- **Demo:** Freelancer connector status flags (writes false) + smoke simulation.
- **Do not say:** Live bidding is enabled.

### 3. Upwork — Corporate Development

- **Thesis:** Category-leading marketplace needs a **fail-closed agentic pursuit** feature for enterprise/compliance, not another freelancer tool.
- **Why not a competitor:** No Upwork adapter exists. The product is a kernel they would own and brand.
- **Why they might care:** Same agent-ToS problem as Fiverr, at larger enterprise mix.
- **Demo:** Trust Kernel + `NEEDS_YOU` + `externalActionAllowed = false`.
- **Do not say:** There is an Upwork integration today.

### 4. GitHub / Microsoft — Corporate Development

- **Thesis:** Official GitHub Issues collector + WorkOrder/reuse preflight is issue-to-governed-work for Copilot / agent mode. Organizational memory is the BuildGraph gate, not a second catalog.
- **Why not a competitor:** Collector is REST official API, PR-excluding, token never logged or receipt-hashed. No issue comments or writes.
- **Why they might care:** Agent coding products need provenance and human gates before “the bot opened a PR / emailed a vendor.”
- **Demo:** GitHub collector health states + capability graph MCP tools (read-only).
- **Optional upside (not shipped):** PR #16 Knowledge Inbox.

### 5. OpenAI — Corporate Development / Applied

- **Thesis:** ChatGPT skills + MCP plugin profiles already map discovery → plan → fulfill → verify → deliver. The missing piece they buy is a **Trust Kernel** for tool-using agents (human-gated writes).
- **Why not a competitor:** Plugins are repository-local descriptors, not an OpenAI-hosted app claiming production writes.
- **Why they might care:** Safety and enterprise procurement of agent tools.
- **Demo:** `scripts/verify-buildgraph-plugins.mjs` (5 profiles, 5 read-only tools) + investigation packet.

### 6. Anthropic — Corporate Development / Applied

- **Thesis:** Same Trust Kernel story for Claude/MCP tool use: evidence, expiry-bound approval, independent verification.
- **Why not a competitor:** No Anthropic-specific runtime is claimed. Skills are portable markdown instructions subordinate to policy.
- **Why they might care:** Constitutional/safety positioning plus enterprise MCP.
- **Demo:** Same as OpenAI; emphasize fail-closed residual risks rather than hype.

## Tier B (do not email in the first wave)

- **Contra, Toptal, LinkedIn Talent** — independent-talent qualification without spam. Use only if Tier A is silent.
- **Coupa / SAP Ariba / Jaggaer** — lead with Critical Investigation Packets and P0-Critical policy, **not** freelance bidding. Use only if the meeting owner is procurement/risk, not marketplace growth.

## Tier C — acquihire-first

If product desks stall, reframe as **IP assignment + employment** to product-engineering orgs hiring for workflow/agent platforms. The public site already invites role conversations at hello@fullstackassets.com.

## First-meeting demo (all desks)

Follow [demo-script.md](demo-script.md). In one sentence: **smoke completes in simulation with zero side effects; a $1.4M signal becomes mandatory investigation, not a bid.**

## Targeting rules

- Complete [founder-checklist.md](founder-checklist.md) before any send.
- Six Tier-A emails only in wave 1 ([outreach-emails.md](outreach-emails.md)).
- One follow-up after 10 business days; then stop that desk.
- No cold LinkedIn spam from this repo, no valuation, no live-execution claims.
- No request that Fiverr or Freelancer “turn on write APIs” as a customer proof.
