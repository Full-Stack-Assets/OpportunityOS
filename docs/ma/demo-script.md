# Buyer demo script (10 minutes)

**Goal:** Show a corporate-development audience that OpportunityOS **completes simulation work with an audit trail** and **treats a $1.4M signal as investigation, not a bid**.  
**Never** imply live marketplace execution. Control-plane table numbers are synthetic; say so if the UI is shown.

## Setup (before the call)

From a clean checkout of `main`:

```bash
npm install --ignore-scripts
npm test
npm run smoke
npm run demo
```

Expected smoke JSON includes `"executionMode":"SIMULATION"` and `"externalSideEffects":0`.  
Expected demo JSON includes `"externalActionAllowed":false` and `"priority":"P0_CRITICAL"`.

Optional UI: `npm run dev` — point at the preview notice (“Synthetic pipeline counts…”). Do not present those counts as customers.

## Minute-by-minute

1. **(1 min) Positioning.** “This is a kernel, not a marketplace. We stop before outreach.”
2. **(2 min) Smoke.** Run `npm run smoke`. Read the JSON aloud: completed, verified, simulation, zero side effects, three receipts.
3. **(3 min) Investigation packet.** Run `npm run demo`. Show:
   - verified `$1.4M` stays a budget ceiling / fact
   - expected contract value is not invented
   - `externalActionAllowed` is false even at `READY_FOR_HUMAN_REVIEW` when tasks resolve
4. **(2 min) Source boundary.** One slide or README quote: Freelancer = `buyer_opportunity`, Fiverr = `service_listing`. Fiverr cannot create a client WorkOrder.
5. **(2 min) Residual risk.** Signature provider injected; no live BuildGraph claimed; writes stay off. Ask: “Where would this kernel sit in your agent or marketplace stack?”

## What not to do

- Do not run Freelancer/Fiverr against production with a personal token as a “wow.”
- Do not enable write tools.
- Do not show unmerged PR #16/#22 as shipped.
- Do not quote ARR or pipeline.

## Recording (optional)

Screen-record the `npm run smoke` and `npm run demo` terminals only. Keep it under ten minutes. Attach the one-pager, not this full CIM.
