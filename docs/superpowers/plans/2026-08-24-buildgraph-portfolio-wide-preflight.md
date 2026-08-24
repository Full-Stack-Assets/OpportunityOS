# BuildGraph Portfolio-Wide Automatic Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BuildGraph preflight an inherited, fail-closed control gate for substantial work across every existing and future canonical project while allowing routine maintenance to continue without unnecessary preflight calls.

**Architecture:** Add a deterministic scope classifier and portfolio gate in core, persist per-project policy plus immutable-style preflight receipts in PostgreSQL, expose read-only MCP policy evaluation, and update the shared BuildGraph skill so agents invoke the same central rule. Existing projects receive an explicit live policy row; new project registration inherits `preflightRequired=true` unless a recorded governance exemption exists.

**Tech Stack:** TypeScript 6, Node.js test runner, PostgreSQL/Supabase, MCP SDK, existing OpportunityOS BuildGraph core and Postgres packages.

**Spec:** `docs/superpowers/specs/2026-08-16-buildgraph-portfolio-wide-preflight-design.md`

## Global Constraints

- Substantial work must fail closed when BuildGraph registry state is unavailable or materially ambiguous.
- Routine maintenance may bypass a fresh preflight only while it remains inside an existing project/product/architecture boundary.
- `CREATE_NEW` is exceptional and requires evidence-backed justification plus a durable receipt.
- Every active and future canonical project inherits `preflightRequired=true` by default.
- Project adapters call shared BuildGraph logic; they may not implement independent decision rules.
- Preflight grants no marketplace, messaging, payment, publication, deployment, credential, legal, or destructive authority.
- No source-system write authority is added.

---

### Task 1: Deterministic portfolio scope and gate contract

**Files:**
- Create: `packages/core/src/portfolio-preflight.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/portfolio-preflight.test.mjs`

**Interfaces:**
- Consumes: existing `BuildGraphPreflightResult`, `BuildGraphDecision`, `KnowledgePreflightEvidence`.
- Produces:
  - `WorkScope = 'ROUTINE' | 'SUBSTANTIAL'`
  - `PortfolioPreflightRequest`
  - `PortfolioPreflightPolicy`
  - `PortfolioPreflightDecision`
  - `classifyWorkScope(request): WorkScope`
  - `evaluatePortfolioPreflight(request, policy, knowledgeEvidence, preflight): PortfolioPreflightDecision`
  - `createPortfolioPreflightReceipt(decision, now): PortfolioPreflightReceipt`

- [ ] **Step 1: Write the failing core tests**

Create `packages/core/test/portfolio-preflight.test.mjs` with cases equivalent to:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorkScope,
  evaluatePortfolioPreflight,
  createPortfolioPreflightReceipt,
} from '../src/index.ts';

const policy = { preflightRequired: true, routineBypassAllowed: true, exemptionDecisionId: undefined };
const noReuse = {
  request: { name: 'New widget engine', description: 'new reusable engine', capabilities: ['widget.engine'] },
  status: 'NO_REUSE_EVIDENCE', allowCreateNew: true, candidates: [], sourceEvidence: [], activeCandidates: [], archivedCandidates: [], decisionsAndConstraints: [], reusableAssets: [],
};
const createNew = {
  requestId: 'pf-1', decision: 'CREATE_NEW', justification: 'No reusable project satisfies the required capability',
  candidates: [], reusePlan: { reuse: [], extend: [], create: ['widget-engine'] },
  wasteRisk: { score: 2, estimatedRecreationPercent: 1, factors: [] },
  evidence: { projectIds: [], constraintIds: ['policy:portfolio-preflight'], decisionIds: [] },
  generatedAt: '2026-08-24T18:00:00.000Z', payloadHash: 'payload-1',
};

test('routine maintenance bypasses fresh preflight', () => {
  assert.equal(classifyWorkScope({ kind: 'BUG_FIX', summary: 'Fix parser null check', createsReusableCapability: false, changesArchitecture: false }), 'ROUTINE');
  const result = evaluatePortfolioPreflight(
    { id: 'work-1', kind: 'BUG_FIX', summary: 'Fix parser null check', createsReusableCapability: false, changesArchitecture: false },
    policy,
    undefined,
    undefined,
  );
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'ROUTINE_BYPASS');
});

test('new project and material feature work are substantial', () => {
  assert.equal(classifyWorkScope({ kind: 'NEW_PROJECT', summary: 'Create project', createsReusableCapability: true, changesArchitecture: true }), 'SUBSTANTIAL');
  assert.equal(classifyWorkScope({ kind: 'FEATURE', summary: 'Add new persistent agent subsystem', createsReusableCapability: true, changesArchitecture: false }), 'SUBSTANTIAL');
});

test('substantial work fails closed without knowledge evidence', () => {
  const result = evaluatePortfolioPreflight(
    { id: 'work-2', kind: 'NEW_PROJECT', summary: 'Create project', createsReusableCapability: true, changesArchitecture: true },
    policy,
    undefined,
    undefined,
  );
  assert.deepEqual(result, { allowed: false, scope: 'SUBSTANTIAL', reason: 'BUILDGRAPH_PREFLIGHT_REQUIRED' });
});

test('reuse evidence blocks parallel creation and returns required target', () => {
  const evidence = { ...noReuse, status: 'REUSE_EVIDENCE_FOUND', allowCreateNew: false, activeCandidates: ['knowledge:project:opportunityos'], reusableAssets: ['knowledge:project:opportunityos'] };
  const reuse = { ...createNew, decision: 'EXTEND_EXISTING', primaryProjectId: 'knowledge:project:opportunityos' };
  const result = evaluatePortfolioPreflight(
    { id: 'work-3', kind: 'FEATURE', summary: 'New acquisition engine', createsReusableCapability: true, changesArchitecture: true },
    policy,
    evidence,
    reuse,
  );
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'BUILDGRAPH_REUSE_REQUIRED');
  assert.equal(result.primaryProjectId, 'knowledge:project:opportunityos');
});

test('CREATE_NEW requires both no-reuse evidence and explicit justification', () => {
  const result = evaluatePortfolioPreflight(
    { id: 'work-4', kind: 'NEW_PROJECT', summary: 'Create unique engine', createsReusableCapability: true, changesArchitecture: true },
    policy,
    noReuse,
    createNew,
  );
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'BUILDGRAPH_CREATE_NEW_AUTHORIZED');
  assert.ok(result.justification.length > 0);
});

test('scope escalation reclassifies routine work as substantial', () => {
  assert.equal(classifyWorkScope({ kind: 'BUG_FIX', summary: 'Fix bug', createsReusableCapability: false, changesArchitecture: true }), 'SUBSTANTIAL');
});

test('receipt hash is deterministic for identical decisions', () => {
  const decision = evaluatePortfolioPreflight(
    { id: 'work-4', kind: 'NEW_PROJECT', summary: 'Create unique engine', createsReusableCapability: true, changesArchitecture: true },
    policy,
    noReuse,
    createNew,
  );
  const a = createPortfolioPreflightReceipt(decision, '2026-08-24T18:00:00.000Z');
  const b = createPortfolioPreflightReceipt(decision, '2026-08-24T18:00:00.000Z');
  assert.equal(a.receiptHash, b.receiptHash);
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
npm run build:core && node --experimental-strip-types --test packages/core/test/portfolio-preflight.test.mjs
```

Expected: failure because `portfolio-preflight.ts` and its exports do not yet exist.

- [ ] **Step 3: Implement the minimal deterministic classifier/gate**

Create `packages/core/src/portfolio-preflight.ts` with explicit enums and no keyword-only guesswork. `WorkKind` must include `NEW_PROJECT`, `NEW_PRODUCT`, `FEATURE`, `ARCHITECTURE`, `INTEGRATION`, `AGENT`, `SKILL`, `RESEARCH_PROGRAM`, `REFACTOR`, `BUG_FIX`, `TEST`, `DOCS`, `DEPENDENCY`, and `MAINTENANCE`.

Rules:

```ts
const ALWAYS_SUBSTANTIAL = new Set<WorkKind>([
  'NEW_PROJECT','NEW_PRODUCT','ARCHITECTURE','INTEGRATION','AGENT','SKILL','RESEARCH_PROGRAM',
]);

export function classifyWorkScope(request: PortfolioPreflightRequest): WorkScope {
  if (ALWAYS_SUBSTANTIAL.has(request.kind)) return 'SUBSTANTIAL';
  if (request.changesArchitecture || request.createsReusableCapability) return 'SUBSTANTIAL';
  if (request.kind === 'FEATURE' || request.kind === 'REFACTOR') return 'SUBSTANTIAL';
  return 'ROUTINE';
}
```

`evaluatePortfolioPreflight()` must:
- allow `ROUTINE` only when policy permits routine bypass;
- block `SUBSTANTIAL` if policy requires preflight and evidence/preflight is absent;
- block on knowledge `REVIEW` or `BUILDGRAPH_KNOWLEDGE_UNAVAILABLE`;
- block reuse/extend/merge/fork/refactor/archive decisions from being treated as permission to create a parallel implementation;
- allow only `CREATE_NEW` where `knowledgeEvidence.allowCreateNew === true`, `preflight.decision === 'CREATE_NEW'`, and `preflight.justification.trim()` is non-empty;
- never convert an exemption into external-action authority.

`createPortfolioPreflightReceipt()` must use existing `hashCanonical()` and include work ID, scope, outcome, reason, primary project ID, BuildGraph decision, evidence IDs, justification, generated time, and deterministic hash.

- [ ] **Step 4: Export the API from `packages/core/src/index.ts`**

Add:

```ts
export * from './portfolio-preflight.ts';
```

- [ ] **Step 5: Run focused tests and core typecheck**

Run:

```bash
npm run build:core
node --experimental-strip-types --test packages/core/test/portfolio-preflight.test.mjs
npm run typecheck:local
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/portfolio-preflight.ts packages/core/src/index.ts packages/core/test/portfolio-preflight.test.mjs
git commit -m "feat: add portfolio-wide BuildGraph gate"
```

### Task 2: Persist project policy and preflight receipts

**Files:**
- Create: `database/migrations/003_buildgraph_portfolio_preflight.sql`
- Modify: `packages/postgres/src/knowledge-store.ts`
- Modify: `packages/postgres/src/index.ts`
- Test: `packages/postgres/test/knowledge-store.test.mjs`

**Interfaces:**
- Consumes: `PortfolioPreflightReceipt`, canonical project IDs.
- Produces:
  - `KnowledgeProjectPolicyRecord`
  - `putProjectPolicy(policy): Promise<void>`
  - `getProjectPolicy(projectId): Promise<KnowledgeProjectPolicyRecord | undefined>`
  - `recordPreflightReceipt(receipt): Promise<void>`
  - `getPreflightReceipt(receiptId): Promise<StoredPortfolioPreflightReceipt | undefined>`

- [ ] **Step 1: Add failing migration/store tests**

Extend `packages/postgres/test/knowledge-store.test.mjs` to require these tables:

```js
const policySql = readFileSync(new URL('../../../database/migrations/003_buildgraph_portfolio_preflight.sql', import.meta.url), 'utf8');
assert.match(policySql, /create table if not exists knowledge_project_policies/i);
assert.match(policySql, /create table if not exists knowledge_preflight_receipts/i);
assert.match(policySql, /references knowledge_entities\(id\)/i);
```

Add parameterized SQL tests:

```js
await store.putProjectPolicy({ projectId: entity.id, preflightRequired: true, routineBypassAllowed: true, updatedAt: entity.updatedAt });
assert.match(calls[0].text, /insert into knowledge_project_policies/i);
assert.deepEqual(calls[0].values.slice(0, 3), [entity.id, true, true]);

await store.recordPreflightReceipt({
  id: 'preflight:abc', workId: 'work-1', projectId: entity.id, scope: 'SUBSTANTIAL', outcome: 'CREATE_NEW', reason: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED',
  decision: 'CREATE_NEW', justification: 'No reusable project satisfies the requirement', evidence: { projectIds: [], constraintIds: [], decisionIds: [] },
  generatedAt: entity.updatedAt, receiptHash: 'receipt-hash',
});
assert.match(calls.at(-1).text, /insert into knowledge_preflight_receipts/i);
```

- [ ] **Step 2: Run Postgres tests and observe RED**

```bash
npm run build:core && npm run build --workspace @opportunityos/postgres
node --experimental-strip-types --test packages/postgres/test/knowledge-store.test.mjs
```

Expected: missing migration/API failures.

- [ ] **Step 3: Add migration 003**

Create:

```sql
create table if not exists knowledge_project_policies (
  project_id text primary key references knowledge_entities(id) on delete cascade,
  preflight_required boolean not null default true,
  routine_bypass_allowed boolean not null default true,
  exemption_decision_id text,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_preflight_receipts (
  id text primary key,
  work_id text not null,
  project_id text references knowledge_entities(id) on delete set null,
  scope text not null check (scope in ('ROUTINE','SUBSTANTIAL')),
  outcome text not null,
  reason text not null,
  decision text,
  justification text,
  evidence jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  receipt_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_preflight_receipts_project_idx on knowledge_preflight_receipts(project_id, generated_at desc);
create index if not exists knowledge_preflight_receipts_work_idx on knowledge_preflight_receipts(work_id, generated_at desc);
```

- [ ] **Step 4: Implement parameterized store methods**

Use `on conflict(project_id) do update` for policies and `on conflict(id) do update` only to replay an identical deterministic receipt. Map JSON evidence without interpolating source values.

- [ ] **Step 5: Run Postgres tests and typecheck**

```bash
npm run build:core
npm run build --workspace @opportunityos/postgres
node --experimental-strip-types --test packages/postgres/test/knowledge-store.test.mjs
npm run typecheck:local
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/003_buildgraph_portfolio_preflight.sql packages/postgres/src/knowledge-store.ts packages/postgres/src/index.ts packages/postgres/test/knowledge-store.test.mjs
git commit -m "feat: persist BuildGraph project policies and preflight receipts"
```

### Task 3: Automatic policy inheritance during project persistence

**Files:**
- Modify: `packages/postgres/src/knowledge-store.ts`
- Test: `packages/postgres/test/knowledge-store.test.mjs`

**Interfaces:**
- Consumes: `putEntity(entity)`.
- Produces: every persisted entity with `kind === 'project'` receives default project policy when no policy exists.

- [ ] **Step 1: Write failing inheritance test**

```js
test('new project persistence inherits portfolio preflight policy', async () => {
  const { db, calls } = recordingDb();
  const store = new PostgresKnowledgeStore(db);
  await store.putEntity(entity);
  assert.ok(calls.some((call) => /insert into knowledge_project_policies/i.test(call.text)));
  const policyCall = calls.find((call) => /insert into knowledge_project_policies/i.test(call.text));
  assert.deepEqual(policyCall.values.slice(0, 3), [entity.id, true, true]);
});
```

Also test that a non-project entity does not receive a policy row.

- [ ] **Step 2: Run focused test and observe RED**

```bash
npm run build:core && npm run build --workspace @opportunityos/postgres
node --experimental-strip-types --test packages/postgres/test/knowledge-store.test.mjs
```

- [ ] **Step 3: Add default policy write to `putEntity()`**

After the entity upsert/alias writes:

```ts
if (entity.kind === 'project') {
  await this.db.query(
    `insert into knowledge_project_policies (project_id, preflight_required, routine_bypass_allowed, updated_at)
     values ($1,true,true,now())
     on conflict (project_id) do nothing`,
    [entity.id],
  );
}
```

This must never overwrite an explicit exemption or stricter project policy.

- [ ] **Step 4: Run tests and commit**

```bash
npm run build:core
npm run build --workspace @opportunityos/postgres
node --experimental-strip-types --test packages/postgres/test/knowledge-store.test.mjs
git add packages/postgres/src/knowledge-store.ts packages/postgres/test/knowledge-store.test.mjs
git commit -m "feat: inherit BuildGraph policy for new projects"
```

### Task 4: Read-only MCP policy evaluation surface

**Files:**
- Modify: `apps/buildgraph-mcp/src/server.ts`
- Modify: `scripts/verify-buildgraph-plugins.mjs`
- Test: repository BuildGraph MCP/safety verification through `npm test`

**Interfaces:**
- Consumes: `classifyWorkScope`, `evaluatePortfolioPreflight`, existing `compileKnowledgePreflight`.
- Produces read-only tool `buildgraph_evaluate_portfolio_preflight`.

- [ ] **Step 1: Add failing verifier expectation**

Update the verifier's expected MCP tool count/name set to require `buildgraph_evaluate_portfolio_preflight` while retaining read-only/destructive=false annotations.

- [ ] **Step 2: Run verifier and observe RED**

```bash
node scripts/verify-buildgraph-plugins.mjs
```

Expected: missing tool failure.

- [ ] **Step 3: Register the read-only MCP tool**

Input schema must include:
- `work`: `{ id, kind, summary, createsReusableCapability, changesArchitecture }`
- `policy`: `{ preflightRequired, routineBypassAllowed, exemptionDecisionId? }`
- optional knowledge evidence and BuildGraph preflight payloads using existing schemas.

Handler returns only the deterministic evaluation result. It does not persist policies/receipts and does not access external sources directly.

Annotations:

```ts
annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
```

- [ ] **Step 4: Run BuildGraph verifier and typecheck**

```bash
node scripts/verify-buildgraph-plugins.mjs
npm run typecheck --workspace @opportunityos/buildgraph-mcp
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/buildgraph-mcp/src/server.ts scripts/verify-buildgraph-plugins.mjs
git commit -m "feat: expose read-only portfolio preflight evaluator"
```

### Task 5: Make the shared BuildGraph skill mandatory for substantial work

**Files:**
- Modify: `skills/using-buildgraph/SKILL.md`
- Create: `docs/buildgraph-portfolio-preflight.md`

**Interfaces:**
- Consumes: core portfolio gate and MCP evaluator.
- Produces: one agent-facing contract used by project workflows.

- [ ] **Step 1: Update `skills/using-buildgraph/SKILL.md`**

Required sequence must explicitly say:

```markdown
Before any substantial project or feature work:
1. classify the request as ROUTINE or SUBSTANTIAL using the shared portfolio policy;
2. if SUBSTANTIAL, retrieve the live BuildGraph registry and compile knowledge preflight;
3. record exactly one reuse outcome;
4. never start parallel creation when the outcome is REUSE/EXTEND/MERGE/FORK/REFACTOR/ARCHIVE;
5. allow CREATE_NEW only with registry-backed absence evidence and explicit justification;
6. attach/persist a preflight receipt before implementation begins;
7. if the registry is unavailable or materially ambiguous, stop the substantial work as REVIEW/BLOCK.
```

Routine maintenance must be defined narrowly and scope escalation must trigger preflight before the expansion continues.

- [ ] **Step 2: Document adapter contract**

Create `docs/buildgraph-portfolio-preflight.md` explaining:
- central policy inheritance;
- routine/substantial examples;
- fail-closed behavior;
- receipt fields;
- lightweight adapter rule for project orchestrators/CI;
- external authority remains unchanged.

- [ ] **Step 3: Run plugin verification and commit**

```bash
node scripts/verify-buildgraph-plugins.mjs
git add skills/using-buildgraph/SKILL.md docs/buildgraph-portfolio-preflight.md
git commit -m "docs: require BuildGraph preflight for substantial work"
```

### Task 6: Runtime activation and portfolio backfill

**Files:**
- Runtime DB only: existing private Full-Stack-Assets Supabase BuildGraph registry.
- No source-system mutation.

**Interfaces:**
- Consumes migration 003 plus active canonical project registry.
- Produces policy coverage for every active canonical project and one activation receipt/evidence record.

- [ ] **Step 1: Apply migration 003 to the private BuildGraph database**

Apply the exact reviewed SQL from `database/migrations/003_buildgraph_portfolio_preflight.sql` using the database migration action, not ad-hoc DDL.

- [ ] **Step 2: Backfill policy rows for all project entities**

Run parameterized/set-based SQL equivalent to:

```sql
insert into knowledge_project_policies(project_id, preflight_required, routine_bypass_allowed, updated_at)
select id, true, true, now()
from knowledge_entities
where kind = 'project'
on conflict(project_id) do nothing;
```

Do not overwrite explicit existing policies.

- [ ] **Step 3: Verify complete coverage**

Verify:

```sql
select
  count(*) filter (where e.kind='project') as projects,
  count(*) filter (where e.kind='project' and p.project_id is not null) as projects_with_policy,
  count(*) filter (where e.kind='project' and p.preflight_required) as projects_requiring_preflight
from knowledge_entities e
left join knowledge_project_policies p on p.project_id=e.id;
```

Acceptance: `projects = projects_with_policy = projects_requiring_preflight` unless an explicit governance exemption is already present and evidenced.

- [ ] **Step 4: Run three live preflight canaries**

Use the same overlap cases already validated during activation:
- autonomous opportunity acquisition platform -> `EXTEND_EXISTING` OpportunityOS;
- AI musical artist OS with persistent voice -> `EXTEND_EXISTING` BLAIZE SUNDAY;
- globe-first 4D alternate-world simulator -> `EXTEND_EXISTING` Worldline.

Persist a receipt for each substantial canary. Verify `CREATE_NEW` is not selected.

- [ ] **Step 5: Record activation checkpoint**

Store an evidence/receipt entry recording project coverage count, three canary outcomes, migration version, and the fail-closed rule. Do not claim that external agents or repositories without a BuildGraph-aware entrypoint have been independently patched; central policy is authoritative and adapters are a reusable integration surface.

### Task 7: Full repository verification and review PR

**Files:**
- Review all changed files from Tasks 1-5.

**Interfaces:**
- Produces exact-head verification evidence and a draft PR for review.

- [ ] **Step 1: Run full verification**

```bash
npm test
npm run typecheck
npm run smoke
npm run build
```

Expected: all pass.

- [ ] **Step 2: Verify authority boundary statically**

Confirm the new core/MCP files do not introduce provider POST/PUT/PATCH/DELETE logic, marketplace sends, payments, deployment actions, credential persistence, or destructive source mutations.

- [ ] **Step 3: Open a draft pull request**

Base the PR on `codex/buildgraph-v0.2` because this tranche depends on the persistent knowledge registry and preflight compiler living there. The PR body must include:
- design/spec and implementation-plan paths;
- core gate semantics;
- policy/receipt persistence;
- project inheritance behavior;
- MCP/skill integration;
- live policy coverage counts;
- canary outcomes;
- exact-head test/typecheck/smoke/build evidence;
- explicit statement that no production app deployment or consequential external action is included.

Do not merge.
