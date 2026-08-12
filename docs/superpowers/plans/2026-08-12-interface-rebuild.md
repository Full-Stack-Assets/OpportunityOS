# OpportunityOS Interface Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved OpportunityOS discovery-to-verification dashboard on an isolated review branch.

**Architecture:** Preserve the current Next.js server-rendered control plane and all existing environment/configuration semantics. Recompose only `apps/control-plane/app/page.tsx` and its stylesheet, with a structural test added to the existing Node test suite.

**Tech Stack:** Next.js, React, TypeScript, Node test runner, existing monorepo build/typecheck/smoke commands.

## Global Constraints
- Branch: `review/interface-rebuild-2026-08` only.
- Keep execution mode simulation-only and all fail-closed boundaries visible.
- Do not change worker authority, Trust Kernel, BuildGraph, persistence, secrets, DNS, or GitHub Pages production behavior.
- Do not fabricate live opportunity outcomes.

---

### Task 1: Lock the UI contract
**Files:**
- Create: `packages/core/test/interface-rebuild.test.mjs`

- [ ] Write assertions for the approved hero, six pipeline stages, Active Opportunities table, and simulation boundary.
- [ ] Open a draft PR and verify CI fails before implementation.

### Task 2: Rebuild control-plane page
**Files:**
- Modify: `apps/control-plane/app/page.tsx`

- [ ] Preserve environment-derived PostgreSQL, BuildGraph, and execution-mode state.
- [ ] Add the approved hero and navigation treatment.
- [ ] Render six pipeline summary cards.
- [ ] Render a representative opportunity-state table explicitly labeled as interface preview data rather than live outcomes.
- [ ] Keep the operator/fail-closed boundary prominent.

### Task 3: Rebuild visual system
**Files:**
- Modify: `apps/control-plane/app/styles.css`

- [ ] Implement the pale-green/white responsive shell, sidebar/dashboard composition, cards, status pills, and mobile layout.
- [ ] Avoid animation or styling that obscures governance state.

### Task 4: Verify
- [ ] Confirm `npm test`, `npm run typecheck`, `npm run smoke`, and `npm run build` pass in PR CI.
- [ ] Keep PR draft and do not merge or deploy.