# OpportunityOS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `Full-Stack-Assets/OpportunityOS` with a production-oriented Release `0.1.0-simulation` vertical slice that turns opportunities into governed, independently verified WorkOrders without performing unapproved external side effects.

**Architecture:** Use a TypeScript monorepo. `@opportunityos/core` owns deterministic domain behavior and security invariants, a Next.js control plane renders operator state, a separate worker executes simulation-safe WorkOrder steps, PostgreSQL is the canonical persistence target, and BuildGraph OS is consulted through a fail-closed preflight client before new work is created. Trust Kernel approval and receipt logic stays isolated from factories.

**Tech Stack:** Node.js 22+, TypeScript, Next.js 16.2+, React 19.2+, PostgreSQL, npm workspaces, GitHub Actions.

## Global Constraints

- Release `0.1.0-simulation` must never claim a consequential external action executed when it did not.
- BuildGraph preflight is mandatory before `CREATE_NEW`; missing or invalid preflight fails closed.
- Authorization is payload-bound, action-specific, expiring, and independently verifiable.
- Canonical JSON + SHA-256 binds requests, approvals, artifacts, and receipts.
- Factory output is not trusted until an independent verifier produces evidence.
- Monetary values use integer cents; unknown economics remain unknown rather than fabricated.
- PostgreSQL is the canonical production persistence target; memory-only behavior is test/simulation support.
- Deployment remains provider-neutral and inactive in this release.
- Secret-like files and credentials must never be committed.

---

### Task 1: Deterministic contracts and Trust Kernel
- [ ] Add canonical JSON and SHA-256 helpers with order-independent hashing tests.
- [ ] Add payload-bound approval validation, expiry checks, verifier injection, and chained receipts.
- [ ] Verify red → green behavior with Node's test runner.

### Task 2: Opportunity, WorkOrder, and requirements kernels
- [ ] Add deterministic opportunity ranking and evidence quality handling.
- [ ] Add explicit WorkOrder state transitions including `NEEDS_YOU` and fail-closed invalid transitions.
- [ ] Compile requirement dependencies into an acyclic execution order and reject cycles/missing dependencies.

### Task 3: BuildGraph gate and factories
- [ ] Implement the BuildGraph `/v1/preflight` contract and fail-closed start decision.
- [ ] Add simulation-only Software/Web, Research/Documents, and Automation factory contracts.
- [ ] Keep consequential execution outside factory code.

### Task 4: Independent verification, economics, and orchestration
- [ ] Verify artifact checksums independently from factories.
- [ ] Track economics only from evidence-backed integer-cent values.
- [ ] Orchestrate preflight → requirements → factory → verifier → receipts for a complete simulation run.

### Task 5: Production boundaries
- [ ] Add PostgreSQL schema/migration for opportunities, WorkOrders, approvals, BuildGraph preflights, artifacts, receipts, economics, and telemetry.
- [ ] Add separate worker app and Next.js control plane.
- [ ] Add CI, operations, threat model, BuildGraph integration docs, and release evidence matrix.
- [ ] Run local tests/typecheck and publish verified source through the connected GitHub app.
