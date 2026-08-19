# IP, copyright, and name collision

**Not legal advice.** Founder and buyer counsel should replace this checklist with executed documents.

## Copyright holder

Unregistered copyright in the OpportunityOS source, docs, skills, and plugin descriptors is believed to sit with **Nic Albertson / Full Stack Assets**, as the GitHub organization owner of `Full-Stack-Assets/OpportunityOS`.

Confirm before signing:

- All commit authors are the founder or have signed a CLA / assignment.
- No contractor, client, or employer has an undischarged claim on this code.
- No university IP claim from the in-progress A.S. program (if any coursework overlap exists, disclose it).

## Repository license

As of `main` @ `6903279` there is **no `LICENSE` file**. Downstream users have no inbound OSS license grant. For a sale:

1. Keep the repo all-rights-reserved until closing, **or**
2. Add an explicit license only if it matches the assignment (do not add MIT casually if the deal is proprietary assignment).

Third-party packages remain under their own licenses (non-exhaustive):

- TypeScript (Apache-2.0)
- Next.js / React (MIT)
- `@amplitude/unified` (Amplitude terms)
- `@modelcontextprotocol/sdk` and Python `mcp` (MCP SDK licenses)
- Express, cors, zod, tsx (MIT)
- `requests`, `beautifulsoup4`, `pytest` (BSD/MIT as applicable)

A buyer’s OSS scan should run on the tree; this list is orientation only.

## Trademarks and name collision

**Product name in this repository:** OpportunityOS.

**Collision:** A LinkedIn company page for “OpportunityOS” (Atlanta, Georgia; business consulting / decision-intelligence practice; “myself only”) is **not** this repository and is **not** Full Stack Assets. Diligence must disclose that third-party use. Do not imply common ownership.

**Mitigation options at closing:**

- Keep “OpportunityOS” if a trademark search is clear and the Atlanta use is not a registered mark in relevant classes; or
- Rebrand the product (governed-agent kernel) under a buyer-chosen name; code and contracts can rename without changing the Trust Kernel.

**Other names in-perimeter:** BuildGraph (preflight/capability graph as used here), Full Stack Assets, plugin profile names. Check buyer house marks (Fiverr, Freelancer, GitHub, etc.) are **not** used as product names in outbound materials.

No trademark registration for OpportunityOS by Full Stack Assets is claimed in this data room.

## Domain and web properties

- **In perimeter for discussion:** this GitHub repository and its GitHub Pages control-plane export, if any.
- **Not automatically in perimeter:** fullstackassets.com, Contra profile, ProductWeld, BeyondMythos domains, Amplitude project, or email accounts — unless listed on the bill of sale.

## Secrets and analytics

- Provider tokens are not stored in git (`.env*` ignored except `.env.example`).
- `.env.example` includes `NEXT_PUBLIC_AMPLITUDE_API_KEY` for the static demo. Treat as a public frontend key, rotate if the buyer does not want that project, and do not confuse it with Freelancer/GitHub credentials.

## Adapter ToS / acceptable-use

- Freelancer: official API, read-only tools only.
- Fiverr: public web, no anti-bot bypass, no session cookies, listings are not buyer demand.
- GitHub / Hacker News: official APIs, no writes.

A buyer who wants live bidding must run their own ToS and Trust Kernel activation **after** close. This tranche must not ship write tools as a “favor” to diligence.

## Assignment-on-sale checklist

- [ ] Asset purchase agreement lists the GitHub repo, branches to include, and excludes other org repos by default
- [ ] Copyright assignment / work-made-for-hire language for founder and any contributors
- [ ] Moral-rights waiver where applicable
- [ ] Repo admin transfer or mirror + delete per deal
- [ ] Name/trademark schedule + Atlanta collision disclosure
- [ ] Third-party OSS notices
- [ ] Residual license to founder for portfolio case studies **or** explicit takedown of public claims
- [ ] Employment or consulting agreement (acquihire continuity)
- [ ] Non-compete/non-solicit scoped to the perimeter (do not accidentally sell the whole studio’s future work unless intended)
- [ ] Representation: no live customer data in the repo; simulation-only execution mode
