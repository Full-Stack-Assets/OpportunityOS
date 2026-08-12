# OpportunityOS Interface Rebuild Design

## Goal
Rebuild the OpportunityOS control-plane landing surface to match the approved light green execution dashboard while preserving the current simulation-only governance boundary, runtime configuration visibility, and existing backend/control-plane contracts.

## Visual contract
- White and pale-green product shell with OPPORTUNITYOS branding.
- Hero: “From Opportunity Discovery to Verified Execution.”
- Pipeline summary cards: Discover, Evaluate, Approve, Execute, Verify, Close.
- Active Opportunities table with opportunity, score, status, and owner columns.
- Preserve explicit simulation-mode and fail-closed messaging; no UI may imply consequential execution is enabled.
- Use repository-defined product concepts and truthful configuration status; do not invent live opportunity outcomes.

## Architecture
Keep the existing Next.js control-plane app and environment-derived configuration. The page remains server-rendered and presentation-only. No changes to core orchestration, persistence, Trust Kernel, BuildGraph contracts, or worker authority.

## Testing
Add a structural control-plane UI contract test to the existing Node test suite. It must fail before the page is rebuilt and pass after the approved pipeline/table surfaces exist.

## Review boundary
All work remains on `review/interface-rebuild-2026-08`; no merge, Pages cutover, production deployment, secrets, DNS, or authority changes.