# Shared Acquisition Fabric Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the separate, persistent Acquisition Fabric substrate that shares one Freelancer connection across GPT, Grok, Manus, and OpportunityOS; continuously ingests verified source records; materializes a canonical provenance-rich opportunity ledger; and exposes identical read results through authenticated HTTP and MCP interfaces.

**Architecture:** Create a private TypeScript monorepo, `Full-Stack-Assets/AcquisitionFabric`, with a PostgreSQL-backed Connection Gateway, provider adapter boundary, 15-second Freelancer live collector, encrypted observation payload store, transactional ingestion/outbox runtime, deterministic ledger materializer, scoped agent authentication, HTTP query/event API, and Streamable HTTP MCP endpoint. The owner's separate Freelancer OAuth service remains the canonical token owner; the Fabric stores only an opaque `secretRef` and requests short-lived in-memory token leases through a broker contract. Provider application writes are deliberately absent from this plan.

**Tech Stack:** Node.js `>=22.13.0`, TypeScript, npm workspaces, PostgreSQL 16+, `pg`, Zod, Express 5, official Model Context Protocol TypeScript SDK, Node `crypto`, Node test runner through `tsx`, Docker/OCI containers, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-24-shared-acquisition-fabric-design.md`

## Global Constraints

- Repository visibility is private because it contains account-derived metadata and deployment configuration, even though provider credentials remain outside the repository.
- The Freelancer OAuth service being built by the owner is canonical. Do not create a second OAuth client or persist Freelancer access/refresh tokens in Acquisition Fabric.
- Provider passwords, access tokens, refresh tokens, API tokens, cookies, MFA material, authorization headers, and token-broker bearer values must never appear in model-visible records, logs, telemetry, hashes, receipts, database exports, fixtures, or committed source.
- The Fabric stores only `ConnectionRecord.secretRef`, an opaque identifier owned by the token broker or managed secret system.
- High-velocity Freelancer acquisition target: P95 `<= 30 seconds`; default live partition cadence: `15 seconds`.
- Durable-observation-to-OpportunityOS-decision target remains P95 `<= 15 seconds`, but OpportunityOS decision implementation is Tranche E and is not added by this plan.
- A failed, malformed, rate-limited, unauthenticated, or unverifiable provider call emits zero verified observations and an explicit failure receipt. It never becomes “no activity.”
- Cursors advance only in the same database transaction that commits collector run, encrypted payload, observations, and outbox events.
- At-least-once execution must not create duplicate observations, opportunities, revisions, pursuits, notifications, or future applications.
- Unknown source values remain `null`/unknown; they are never converted to zero, false, empty budget, or “no activity.”
- No provider application, bid, message, contract, milestone, payment, or paid-credit action is implemented in this plan.
- The runtime must be deployable as managed OCI containers and must not rely on an owner-operated laptop, phone, home server, or active model session.
- All code changes use TDD, strict TypeScript, parameterized SQL, bounded retries, frequent commits, and fail-closed defaults.

---

## File and Responsibility Map

The implementation creates this structure in the new repository:

```text
AcquisitionFabric/
├── .github/workflows/ci.yml                 # PostgreSQL-backed build, tests, secret scan
├── config/freelancer-live.v1.json           # Versioned 15-second live partition policy
├── database/migrations/
│   ├── 001_connections_and_auth.sql          # Connections and scoped agent credentials
│   ├── 002_ingestion.sql                     # Partitions, runs, payloads, observations, outbox, DLQ
│   └── 003_ledger.sql                        # Opportunities, aliases, revisions, provenance, pursuits
├── deploy/
│   ├── Dockerfile.api                        # HTTP + MCP image
│   ├── Dockerfile.worker                     # Continuous ingestion + ledger image
│   └── compose.yaml                          # Local PostgreSQL, API, worker, fake broker test shape
├── apps/
│   ├── api/src/
│   │   ├── app.ts                            # Express application factory
│   │   ├── auth.ts                           # Request principal/scoped middleware adapter
│   │   ├── routes.ts                         # HTTP query, event, connection routes
│   │   ├── mcp.ts                            # MCP tool registration and transport
│   │   └── main.ts                           # Production entry point
│   └── worker/src/
│       ├── main.ts                           # Adapter registry + continuous scheduler
│       └── health.ts                         # Worker health endpoint
├── packages/
│   ├── contracts/src/
│   │   ├── canonical.ts                      # Canonical JSON + SHA-256
│   │   ├── connection.ts                     # ConnectionRecord, health, capability schemas
│   │   ├── provider.ts                       # ProviderAdapter and collection contracts
│   │   ├── observation.ts                    # SourceObservation and receipt schemas
│   │   ├── ledger.ts                         # Opportunity, alias, revision, provenance schemas
│   │   ├── events.ts                         # Versioned outbox event envelopes
│   │   └── index.ts                          # Public contract exports
│   ├── postgres/src/
│   │   ├── pool.ts                           # pg pool and transaction helpers
│   │   ├── migrate.ts                        # Ordered SQL migration runner
│   │   └── index.ts
│   ├── auth/src/
│   │   ├── tokens.ts                         # One-time bearer creation + hash verification
│   │   ├── repository.ts                     # Agent credential persistence
│   │   ├── authorize.ts                      # Least-privilege scope checks
│   │   └── index.ts
│   ├── connections/src/
│   │   ├── broker.ts                         # TokenBrokerClient contract + HTTP implementation
│   │   ├── repository.ts                     # ConnectionRecord persistence
│   │   ├── service.ts                        # Upsert, verify, reauthorization state
│   │   └── index.ts
│   ├── payloads/src/
│   │   ├── redact.ts                         # Recursive secret-key removal
│   │   ├── crypto.ts                         # AES-256-GCM envelope encryption
│   │   ├── repository.ts                     # Encrypted payload persistence/deletion marker
│   │   └── index.ts
│   ├── provider-freelancer/src/
│   │   ├── client.ts                         # Official API HTTP client using token leases
│   │   ├── normalize.ts                      # Structural source validation/normalization
│   │   ├── adapter.ts                        # ProviderAdapter implementation and live cursor
│   │   └── index.ts
│   ├── ingestion/src/
│   │   ├── leases.ts                         # PostgreSQL distributed lease operations
│   │   ├── backoff.ts                        # Bounded retry policy
│   │   ├── repository.ts                     # Atomic run/observation/cursor/outbox transaction
│   │   ├── runner.ts                         # One partition execution
│   │   ├── scheduler.ts                      # Live lane scheduler
│   │   └── index.ts
│   └── ledger/src/
│       ├── identity.ts                       # Safe URL/content/source identities
│       ├── repository.ts                     # Ledger persistence/query boundary
│       ├── materializer.ts                   # Deterministic link/create/revise workflow
│       ├── worker.ts                         # Outbox consumer and durable offset
│       └── index.ts
├── scripts/
│   ├── issue-agent-token.ts                  # Prints one bearer token once; stores only hash
│   ├── seed-freelancer-partition.ts          # Idempotent live partition seed
│   ├── smoke.ts                              # End-to-end substrate smoke verifier
│   └── scan-secrets.mjs                      # Repository/log/fixture secret-pattern gate
└── test/support/
    ├── database.ts                           # Isolated schema/reset helpers
    ├── fake-token-broker.ts                  # Exact OAuth broker contract fixture
    └── fake-freelancer-api.ts                # Deterministic provider fixture server
```

The source design remains in OpportunityOS. After repository creation, copy the approved spec and this plan into `AcquisitionFabric/docs/superpowers/{specs,plans}/` unchanged so the implementation repository carries its governing documents.

---

### Task 1: Create the Private Repository and Strict Monorepo Baseline

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/scan-secrets.mjs`
- Create: `test/baseline.test.ts`
- Copy: `docs/superpowers/specs/2026-08-24-shared-acquisition-fabric-design.md`
- Copy: `docs/superpowers/plans/2026-08-24-shared-acquisition-fabric-foundation-v1.md`

**Interfaces:**
- Consumes: approved OpportunityOS spec and this implementation plan.
- Produces: a private npm-workspace repository whose canonical commands are `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`, and `npm run scan:secrets`.

- [ ] **Step 1: Create and clone the repository**

```bash
gh repo create Full-Stack-Assets/AcquisitionFabric \
  --private \
  --description "Persistent shared connection, ingestion, provenance, and opportunity-ledger substrate" \
  --clone
cd AcquisitionFabric
git checkout -b codex/foundation-v1
mkdir -p apps/api/src apps/worker/src packages/{contracts,postgres,auth,connections,payloads,provider-freelancer,ingestion,ledger}/{src,test} database/migrations config deploy scripts test/support docs/superpowers/{specs,plans}
```

Expected: `gh repo view Full-Stack-Assets/AcquisitionFabric --json visibility,nameWithOwner` returns `PRIVATE` and `Full-Stack-Assets/AcquisitionFabric`.

- [ ] **Step 2: Write the failing baseline test**

```ts
// test/baseline.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import packageJson from '../package.json' with { type: 'json' };

test('repository is a private package workspace with required commands', () => {
  assert.equal(packageJson.private, true);
  assert.deepEqual(packageJson.workspaces, ['apps/*', 'packages/*']);
  for (const command of ['test', 'typecheck', 'build', 'smoke', 'scan:secrets']) {
    assert.equal(typeof packageJson.scripts[command], 'string');
  }
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `node --test test/baseline.test.ts`

Expected: FAIL because `package.json` does not exist.

- [ ] **Step 4: Create the workspace configuration**

```json
// package.json
{
  "name": "acquisition-fabric",
  "version": "0.1.0-foundation",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22.13.0" },
  "scripts": {
    "test": "tsx --test \"test/**/*.test.ts\" \"packages/*/test/**/*.test.ts\" \"apps/*/test/**/*.test.ts\"",
    "typecheck": "tsc -b --pretty false",
    "build": "tsc -b --pretty false",
    "smoke": "tsx scripts/smoke.ts",
    "scan:secrets": "node scripts/scan-secrets.mjs"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest"
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

```gitignore
# .gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
```

```dotenv
# .env.example
DATABASE_URL=postgres://postgres:postgres@localhost:5432/acquisition_fabric
PAYLOAD_ENCRYPTION_KEY_B64=
FREELANCER_API_BASE=https://www.freelancer.com/api
FREELANCER_TOKEN_BROKER_URL=
FREELANCER_TOKEN_BROKER_BEARER=
PORT=8080
WORKER_ID=
COLLECTION_ENABLED=true
WRITE_ACTIONS_ENABLED=false
```

- [ ] **Step 5: Add a deterministic local secret scanner**

```js
// scripts/scan-secrets.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((path) => !path.endsWith('package-lock.json'));
const forbidden = [
  /Bearer\s+[A-Za-z0-9._~+\/-]{20,}/,
  /(?:access|refresh|api)[_-]?token\s*[:=]\s*["'][^"']{12,}/i,
  /client[_-]?secret\s*[:=]\s*["'][^"']{8,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const findings = [];
for (const path of files) {
  const text = readFileSync(path, 'utf8');
  for (const pattern of forbidden) if (pattern.test(text)) findings.push(`${path}: ${pattern}`);
}
if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log(`secret scan passed for ${files.length} tracked files`);
```

- [ ] **Step 6: Add PostgreSQL-backed CI and install the toolchain**

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: acquisition_fabric_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/acquisition_fabric_test
      PAYLOAD_ENCRYPTION_KEY_B64: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
      WRITE_ACTIONS_ENABLED: 'false'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run scan:secrets
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run smoke
```

Run: `npm install`

- [ ] **Step 7: Run the baseline gates**

Run: `npm run scan:secrets && npm test && npm run typecheck`

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: bootstrap acquisition fabric workspace"
```

---

### Task 2: Freeze Versioned Shared Contracts and Canonical Hashing

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/canonical.ts`
- Create: `packages/contracts/src/connection.ts`
- Create: `packages/contracts/src/provider.ts`
- Create: `packages/contracts/src/observation.ts`
- Create: `packages/contracts/src/ledger.ts`
- Create: `packages/contracts/src/events.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Consumes: no runtime dependencies except Zod and Node `crypto`.
- Produces: `canonicalJson(value)`, `hashCanonical(value)`, `ConnectionRecordSchema`, `ProviderAdapter`, `CollectionRequestSchema`, `CollectionResultSchema`, `SourceObservationSchema`, `CollectorReceiptSchema`, `OpportunitySchema`, and `FabricEventEnvelopeSchema`.

- [ ] **Step 1: Write failing contract tests**

```ts
// packages/contracts/test/contracts.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConnectionRecordSchema,
  SourceObservationSchema,
  canonicalJson,
  hashCanonical,
} from '../src/index.ts';

test('canonical hashing is key-order independent', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(hashCanonical({ b: 2, a: 1 }), hashCanonical({ a: 1, b: 2 }));
});

test('connection record rejects embedded credential fields', () => {
  assert.throws(() => ConnectionRecordSchema.parse({
    id: 'conn_1', provider: 'freelancer', providerAccountId: '9', accountDisplayName: 'Nic',
    authType: 'oauth2', status: 'HEALTHY', scopes: ['read_projects'], capabilities: ['read_projects'],
    secretRef: 'broker://freelancer/conn_1', issuedAt: null, expiresAt: null, lastRefreshAt: null,
    lastVerifiedAt: '2026-08-24T12:00:00Z', policyVersion: 'connections-v1', metadata: {},
    accessToken: 'must-not-be-accepted'
  }));
});

test('verified observation requires receipt, hashes, timestamps, and payload reference', () => {
  const result = SourceObservationSchema.safeParse({ id: 'obs_1', provider: 'freelancer', verified: true });
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx tsx --test packages/contracts/test/contracts.test.ts`

Expected: FAIL because exports do not exist.

- [ ] **Step 3: Implement canonical JSON exactly once**

```ts
// packages/contracts/src/canonical.ts
import { createHash } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('NON_FINITE_CANONICAL_NUMBER');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : normalize(item));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = normalize(item);
    }
    return result;
  }
  throw new TypeError(`UNSUPPORTED_CANONICAL_TYPE:${typeof value}`);
}

export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value));
export const hashCanonical = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');
```

- [ ] **Step 4: Implement strict schemas and adapter interfaces**

```ts
// packages/contracts/src/connection.ts
import { z } from 'zod';

export const ConnectionHealthStateSchema = z.enum([
  'PENDING', 'HEALTHY', 'DEGRADED', 'AUTH_REQUIRED', 'REAUTH_REQUIRED',
  'RATE_LIMITED', 'UNAVAILABLE', 'SCHEMA_DRIFT', 'POLICY_BLOCKED',
  'CURSOR_INVALID', 'DISABLED'
]);
export const ProviderCapabilitySchema = z.enum([
  'read_projects', 'read_messages', 'read_profile', 'submit_application',
  'send_message', 'withdraw_application'
]);
export const ConnectionRecordSchema = z.object({
  id: z.string().min(1), provider: z.string().min(1), providerAccountId: z.string().min(1).nullable(),
  accountDisplayName: z.string().min(1).nullable(), authType: z.enum(['oauth2', 'api_token', 'public', 'delegated']),
  status: ConnectionHealthStateSchema, scopes: z.array(z.string().min(1)),
  capabilities: z.array(ProviderCapabilitySchema), secretRef: z.string().min(1).nullable(),
  issuedAt: z.string().datetime().nullable(), expiresAt: z.string().datetime().nullable(),
  lastRefreshAt: z.string().datetime().nullable(), lastVerifiedAt: z.string().datetime().nullable(),
  policyVersion: z.string().min(1), metadata: z.record(z.string(), z.unknown())
}).strict();
export type ConnectionRecord = z.infer<typeof ConnectionRecordSchema>;
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;
```

```ts
// packages/contracts/src/observation.ts
import { z } from 'zod';
import { ConnectionHealthStateSchema } from './connection.ts';

export const SourceObservationSchema = z.object({
  id: z.string().min(1), provider: z.string().min(1), connectionId: z.string().min(1).nullable(),
  sourceType: z.enum(['marketplace_project', 'inbound_message', 'public_demand', 'profile', 'other']),
  externalId: z.string().min(1).nullable(), canonicalUrl: z.string().url().nullable(),
  recordKind: z.enum(['buyer_opportunity', 'service_listing', 'message', 'public_signal', 'other']),
  observedAt: z.string().datetime(), retrievedAt: z.string().datetime(), retrievalMethod: z.string().min(1),
  verified: z.boolean(), contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.string().min(1).nullable(), payloadRef: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  queryAttribution: z.array(z.object({ familyId: z.string().min(1), version: z.string().min(1) }).strict()),
  provenanceRefs: z.array(z.string().min(1)), sourcePermissions: z.record(z.string(), z.unknown()),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
export type SourceObservation = z.infer<typeof SourceObservationSchema>;

export const CollectorReceiptSchema = z.object({
  collectorId: z.string().min(1), collectorVersion: z.string().min(1), provider: z.string().min(1),
  partitionId: z.string().min(1), startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  healthBefore: ConnectionHealthStateSchema, healthAfter: ConnectionHealthStateSchema,
  recordsObserved: z.number().int().nonnegative(), recordsVerified: z.number().int().nonnegative(),
  recordsRejected: z.number().int().nonnegative(), recordsDeduplicated: z.number().int().nonnegative(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/), resultFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  previousReceiptHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  failureCode: z.string().min(1).nullable(), failureDetail: z.string().min(1).nullable(),
  cursorBefore: z.unknown(), cursorAfter: z.unknown(), receiptHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
```

```ts
// packages/contracts/src/provider.ts
import type { ConnectionRecord, ProviderCapability } from './connection.ts';
import type { SourceObservation } from './observation.ts';

export interface CollectionRequest {
  partitionId: string;
  connection: ConnectionRecord;
  cursor: unknown;
  limit: number;
  requestedAt: string;
  requestContext: Record<string, unknown>;
}
export interface ConnectionHealth { state: ConnectionRecord['status']; checkedAt: string; detail: string | null; }
export interface CollectionResult {
  observations: Array<{ observation: SourceObservation; payload: unknown }>;
  nextCursor: unknown;
  healthBefore: ConnectionRecord['status'];
  healthAfter: ConnectionRecord['status'];
  rejected: Array<{ sourceId: string | null; reason: string }>;
  requestFingerprint: string;
  resultFingerprint: string;
  failureCode: string | null;
  failureDetail: string | null;
}
export interface ProviderAdapter {
  provider: string;
  version: string;
  retrievalModes: Array<'poll' | 'webhook' | 'push' | 'stream'>;
  capabilityManifest(connection: ConnectionRecord): ProviderCapability[];
  verifyConnection(connection: ConnectionRecord): Promise<ConnectionHealth>;
  collect(input: CollectionRequest): Promise<CollectionResult>;
}
```

Implement `ledger.ts` with nullable material fields, alias/revision/provenance types; implement `events.ts` with `eventId`, `eventType`, `aggregateType`, `aggregateId`, `occurredAt`, `schemaVersion`, and strict payload; export everything from `index.ts`.

- [ ] **Step 5: Install dependencies and run contract gates**

Run:

```bash
npm install zod --workspace packages/contracts
npm run typecheck
npx tsx --test packages/contracts/test/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts package.json package-lock.json
git commit -m "feat: freeze acquisition fabric contracts"
```

---

### Task 3: Add PostgreSQL Migrations and Transaction Helpers

**Files:**
- Create: `database/migrations/001_connections_and_auth.sql`
- Create: `database/migrations/002_ingestion.sql`
- Create: `database/migrations/003_ledger.sql`
- Create: `packages/postgres/package.json`
- Create: `packages/postgres/tsconfig.json`
- Create: `packages/postgres/src/pool.ts`
- Create: `packages/postgres/src/migrate.ts`
- Create: `packages/postgres/src/index.ts`
- Create: `test/support/database.ts`
- Test: `packages/postgres/test/migrations.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`.
- Produces: `createPool(connectionString)`, `withTransaction(pool, callback)`, `migrate(pool, migrationsDir)`, and the complete durable schema used by every later task.

- [ ] **Step 1: Write the failing migration test**

```ts
// packages/postgres/test/migrations.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { freshDatabase } from '../../../test/support/database.ts';

test('migrations create every foundation table', async () => {
  const db = await freshDatabase();
  const result = await db.pool.query<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema = current_schema() order by table_name
  `);
  const names = result.rows.map((row) => row.table_name);
  for (const name of [
    'connections', 'agent_credentials', 'collector_partitions', 'collector_runs',
    'observation_payloads', 'source_observations', 'outbox_events', 'dead_letters',
    'opportunities', 'opportunity_aliases', 'opportunity_revisions', 'dedup_decisions',
    'evidence_links', 'pursuits', 'action_receipts', 'notification_events', 'consumer_offsets'
  ]) assert.ok(names.includes(name), `missing ${name}`);
  await db.close();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx --test packages/postgres/test/migrations.test.ts`

Expected: FAIL because migration helpers and tables do not exist.

- [ ] **Step 3: Create the connection/auth migration**

```sql
-- database/migrations/001_connections_and_auth.sql
begin;
create table connections (
  id text primary key,
  provider text not null,
  provider_account_id text,
  account_display_name text,
  auth_type text not null check (auth_type in ('oauth2','api_token','public','delegated')),
  status text not null check (status in ('PENDING','HEALTHY','DEGRADED','AUTH_REQUIRED','REAUTH_REQUIRED','RATE_LIMITED','UNAVAILABLE','SCHEMA_DRIFT','POLICY_BLOCKED','CURSOR_INVALID','DISABLED')),
  scopes jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  secret_ref text,
  issued_at timestamptz,
  expires_at timestamptz,
  last_refresh_at timestamptz,
  last_verified_at timestamptz,
  policy_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index connections_provider_account_unique
  on connections(provider, provider_account_id) where provider_account_id is not null;
create table agent_credentials (
  id text primary key,
  display_name text not null,
  token_hash char(64) not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
commit;
```

- [ ] **Step 4: Create the ingestion migration**

```sql
-- database/migrations/002_ingestion.sql
begin;
create table collector_partitions (
  id text primary key,
  provider text not null,
  connection_id text references connections(id),
  query_key text not null,
  config jsonb not null,
  cadence_seconds integer not null check (cadence_seconds >= 5),
  cursor jsonb,
  next_run_at timestamptz not null,
  lane text not null check (lane in ('LIVE','BACKFILL')),
  state text not null check (state in ('ENABLED','PAUSED','DISABLED')),
  lease_owner text,
  lease_expires_at timestamptz,
  consecutive_failures integer not null default 0,
  last_receipt_hash char(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, connection_id, query_key)
);
create index collector_partitions_due_idx on collector_partitions(lane, next_run_at) where state = 'ENABLED';
create table collector_runs (
  id text primary key,
  partition_id text not null references collector_partitions(id),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  health_before text not null,
  health_after text not null,
  records_observed integer not null,
  records_verified integer not null,
  records_rejected integer not null,
  records_deduplicated integer not null,
  request_fingerprint char(64) not null,
  result_fingerprint char(64) not null,
  receipt_hash char(64) not null unique,
  previous_receipt_hash char(64),
  failure_code text,
  failure_detail text,
  cursor_before jsonb,
  cursor_after jsonb,
  created_at timestamptz not null default now()
);
create table observation_payloads (
  ref text primary key,
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  key_version text not null,
  payload_hash char(64) not null,
  content_type text not null default 'application/json',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table source_observations (
  id text primary key,
  provider text not null,
  connection_id text references connections(id),
  source_type text not null,
  external_id text,
  canonical_url text,
  record_kind text not null,
  observed_at timestamptz not null,
  retrieved_at timestamptz not null,
  retrieval_method text not null,
  verified boolean not null,
  content_fingerprint char(64) not null,
  source_revision text,
  payload_ref text not null references observation_payloads(ref),
  payload_hash char(64) not null,
  query_attribution jsonb not null,
  provenance_refs jsonb not null,
  source_permissions jsonb not null,
  receipt_hash char(64) not null references collector_runs(receipt_hash),
  created_at timestamptz not null default now()
);
create unique index source_observation_identity_idx on source_observations(
  provider, coalesce(connection_id,''), coalesce(external_id,''), coalesce(source_revision,''), content_fingerprint
);
create table outbox_events (
  id bigserial primary key,
  event_id text not null unique,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  schema_version text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  published_at timestamptz
);
create table dead_letters (
  id bigserial primary key,
  partition_id text references collector_partitions(id),
  run_id text,
  failure_code text not null,
  failure_detail text not null,
  request_context jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
commit;
```

- [ ] **Step 5: Create the ledger migration**

```sql
-- database/migrations/003_ledger.sql
begin;
create table opportunities (
  id text primary key,
  status text not null check (status in ('ACTIVE','STALE','CLOSED','REJECTED','ARCHIVED')),
  current_revision integer not null default 0,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  last_verified_at timestamptz,
  freshness_state text not null check (freshness_state in ('FRESH','STALE','REVALIDATION_REQUIRED')),
  title text,
  description text,
  budget_min numeric,
  budget_max numeric,
  currency text,
  deadline timestamptz,
  current_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table opportunity_aliases (
  id text primary key,
  opportunity_id text not null references opportunities(id),
  observation_id text not null references source_observations(id),
  provider text not null,
  connection_context text not null default '',
  alias_type text not null check (alias_type in ('PROVIDER_EXTERNAL_ID','CANONICAL_URL','CONTENT_WINDOW')),
  alias_value text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create unique index opportunity_alias_active_unique on opportunity_aliases(provider, connection_context, alias_type, alias_value) where active;
create table opportunity_revisions (
  opportunity_id text not null references opportunities(id),
  revision integer not null,
  source_observation_id text not null references source_observations(id),
  snapshot jsonb not null,
  changes jsonb not null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  primary key(opportunity_id, revision)
);
create table dedup_decisions (
  id text primary key,
  opportunity_id text not null references opportunities(id),
  observation_id text not null references source_observations(id),
  decision text not null check (decision in ('CREATE','LINK','POSSIBLE_MATCH','SEPARATE','SPLIT')),
  method text not null,
  policy_version text not null,
  confidence numeric not null check (confidence between 0 and 1),
  evidence_refs jsonb not null,
  actor text not null,
  created_at timestamptz not null default now()
);
create table evidence_links (
  id bigserial primary key,
  opportunity_id text not null references opportunities(id),
  revision integer not null,
  field_path text not null,
  source_observation_id text references source_observations(id),
  derivation_kind text not null check (derivation_kind in ('DIRECT','DERIVED','UNKNOWN')),
  policy_version text not null,
  input_refs jsonb not null
);
create table pursuits (
  id text primary key,
  opportunity_id text not null references opportunities(id),
  provider text not null,
  state text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_pursuit_per_opportunity on pursuits(opportunity_id, provider) where state not in ('LOST','WITHDRAWN','EXPIRED');
create table action_receipts (
  id text primary key,
  pursuit_id text not null references pursuits(id),
  action_type text not null,
  payload_hash char(64) not null,
  outcome text not null,
  provider_response_id text,
  occurred_at timestamptz not null,
  evidence jsonb not null
);
create table notification_events (
  id text primary key,
  opportunity_id text references opportunities(id),
  event_type text not null,
  suppression_key text not null,
  decision text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table consumer_offsets (
  consumer_id text primary key,
  last_outbox_id bigint not null default 0,
  updated_at timestamptz not null default now()
);
commit;
```

- [ ] **Step 6: Implement the migration runner and transaction helper**

```ts
// packages/postgres/src/pool.ts
import pg from 'pg';
export const createPool = (connectionString: string) => new pg.Pool({ connectionString, max: 10 });
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('begin'); const result = await fn(client); await client.query('commit'); return result; }
  catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
```

`migrate.ts` must create `schema_migrations(filename text primary key, applied_at timestamptz)`; read `database/migrations/*.sql` in lexical order; execute each unapplied file and insert its filename in the same transaction.

- [ ] **Step 7: Run migration tests**

Run:

```bash
npm install pg --workspace packages/postgres
npm install -D @types/pg --workspace packages/postgres
npx tsx --test packages/postgres/test/migrations.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add database packages/postgres test/support package.json package-lock.json
git commit -m "feat: add acquisition fabric persistence schema"
```

---

### Task 4: Issue and Enforce Agent-Specific Scoped Credentials

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/tokens.ts`
- Create: `packages/auth/src/repository.ts`
- Create: `packages/auth/src/authorize.ts`
- Create: `packages/auth/src/index.ts`
- Create: `scripts/issue-agent-token.ts`
- Test: `packages/auth/test/auth.test.ts`

**Interfaces:**
- Consumes: PostgreSQL pool.
- Produces: `issueAgentCredential() -> { record, bearerToken }`, `authenticateBearer() -> AgentPrincipal | null`, and `requireScope(principal, scope)`.

- [ ] **Step 1: Write failing token lifecycle tests**

```ts
// packages/auth/test/auth.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { issueAgentCredential, authenticateBearer } from '../src/index.ts';
import { freshDatabase } from '../../../test/support/database.ts';

test('raw bearer is returned once but only its hash is persisted', async () => {
  const db = await freshDatabase();
  const issued = await issueAgentCredential(db.pool, {
    id: 'agent_chatgpt', displayName: 'ChatGPT', scopes: ['opportunities:read'],
    expiresAt: '2027-08-24T00:00:00Z'
  });
  assert.match(issued.bearerToken, /^af_[A-Za-z0-9_-]+$/);
  const row = await db.pool.query('select token_hash from agent_credentials where id=$1', ['agent_chatgpt']);
  assert.equal(row.rows[0].token_hash.length, 64);
  assert.equal(JSON.stringify(row.rows).includes(issued.bearerToken), false);
  assert.equal((await authenticateBearer(db.pool, issued.bearerToken))?.id, 'agent_chatgpt');
  await db.close();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test packages/auth/test/auth.test.ts`

Expected: FAIL because auth functions do not exist.

- [ ] **Step 3: Implement one-time bearer issuance and hash-only verification**

```ts
// packages/auth/src/tokens.ts
import { createHash, randomBytes } from 'node:crypto';
export const hashBearer = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newBearer = (): string => `af_${randomBytes(32).toString('base64url')}`;
```

`issueAgentCredential()` must insert `hashBearer(bearerToken)`, never the raw token. `authenticateBearer()` must reject missing, expired, or revoked credentials, update `last_used_at`, and return `{ id, displayName, scopes }`. `requireScope()` must throw `AUTH_SCOPE_REQUIRED:<scope>` unless the exact scope or `admin:*` is present.

- [ ] **Step 4: Add the issuance CLI**

```ts
// scripts/issue-agent-token.ts
import { createPool } from '@acquisition-fabric/postgres';
import { issueAgentCredential } from '@acquisition-fabric/auth';
const [id, displayName, scopeCsv, expiresAt] = process.argv.slice(2);
if (!id || !displayName || !scopeCsv || !expiresAt) {
  throw new Error('usage: issue-agent-token <id> <display-name> <scope1,scope2> <expires-at>');
}
const pool = createPool(process.env.DATABASE_URL ?? '');
const issued = await issueAgentCredential(pool, { id, displayName, scopes: scopeCsv.split(','), expiresAt });
console.log(JSON.stringify({ id, displayName, scopes: issued.record.scopes, bearerToken: issued.bearerToken }, null, 2));
await pool.end();
```

- [ ] **Step 5: Verify scope and revocation behavior**

Add tests for expired token rejection, revoked token rejection, missing scope rejection, and `admin:*` acceptance; then run:

```bash
npx tsx --test packages/auth/test/auth.test.ts
npm run typecheck
npm run scan:secrets
```

Expected: PASS; scanner must not flag generated runtime values because they are not committed.

- [ ] **Step 6: Commit**

```bash
git add packages/auth scripts/issue-agent-token.ts package.json package-lock.json
git commit -m "feat: add scoped cross-agent authentication"
```

---

### Task 5: Implement the Non-Secret Connection Gateway and Freelancer Token-Broker Contract

**Files:**
- Create: `packages/connections/package.json`
- Create: `packages/connections/tsconfig.json`
- Create: `packages/connections/src/broker.ts`
- Create: `packages/connections/src/repository.ts`
- Create: `packages/connections/src/service.ts`
- Create: `packages/connections/src/index.ts`
- Create: `test/support/fake-token-broker.ts`
- Test: `packages/connections/test/connections.test.ts`

**Interfaces:**
- Consumes: `ConnectionRecord`, PostgreSQL, `FREELANCER_TOKEN_BROKER_URL`, and a service-to-service bearer held only in managed runtime secrets.
- Produces: `TokenBrokerClient.issueAccessLease()`, `ConnectionService.upsert()`, `ConnectionService.get()`, `ConnectionService.list()`, `ConnectionService.markReauthorizationRequired()`, and `ConnectionService.verify()`.

- [ ] **Step 1: Write failing non-secret connection tests**

```ts
// packages/connections/test/connections.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionService } from '../src/index.ts';
import { freshDatabase } from '../../../test/support/database.ts';

test('OAuth callback metadata persists only an opaque secret reference', async () => {
  const db = await freshDatabase();
  const service = new ConnectionService(db.pool);
  await service.upsert({
    id: 'conn_freelancer_nic', provider: 'freelancer', providerAccountId: '123',
    accountDisplayName: 'Nic', authType: 'oauth2', status: 'PENDING',
    scopes: ['read_projects'], capabilities: ['read_projects'],
    secretRef: 'broker://freelancer/conn_freelancer_nic', issuedAt: null, expiresAt: null,
    lastRefreshAt: null, lastVerifiedAt: null, policyVersion: 'connections-v1', metadata: {}
  });
  const stored = await service.get('conn_freelancer_nic');
  assert.equal(stored?.secretRef, 'broker://freelancer/conn_freelancer_nic');
  assert.equal(JSON.stringify(stored).includes('access_token'), false);
  await db.close();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test packages/connections/test/connections.test.ts`

Expected: FAIL because `ConnectionService` does not exist.

- [ ] **Step 3: Define the exact token-broker lease contract**

```ts
// packages/connections/src/broker.ts
import { z } from 'zod';

const LeaseSchema = z.object({
  accessToken: z.string().min(20), tokenType: z.literal('Bearer'), expiresAt: z.string().datetime(),
  providerAccountId: z.string().min(1), scopes: z.array(z.string().min(1))
}).strict();
export type AccessLease = z.infer<typeof LeaseSchema>;
export interface TokenBrokerClient {
  issueAccessLease(input: {
    provider: 'freelancer'; connectionId: string; secretRef: string;
    audience: 'acquisition-fabric'; requestedScopes: string[];
  }): Promise<AccessLease>;
}
export class HttpTokenBrokerClient implements TokenBrokerClient {
  constructor(private readonly baseUrl: string, private readonly serviceBearer: string, private readonly fetchFn: typeof fetch = fetch) {}
  async issueAccessLease(input: Parameters<TokenBrokerClient['issueAccessLease']>[0]): Promise<AccessLease> {
    const response = await this.fetchFn(`${this.baseUrl.replace(/\/$/, '')}/v1/token-leases`, {
      method: 'POST', headers: { authorization: `Bearer ${this.serviceBearer}`, 'content-type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`TOKEN_BROKER_HTTP_${response.status}`);
    return LeaseSchema.parse(await response.json());
  }
}
```

The access token may exist in function-local memory only. Never include the lease in an exception, return value from a model-visible API, collector receipt, observation payload, log, or hash.

- [ ] **Step 4: Implement connection persistence and state transitions**

Use parameterized `insert ... on conflict(id) do update` and parse every database result through `ConnectionRecordSchema`. `markReauthorizationRequired(id, detail)` must set `status='REAUTH_REQUIRED'`, store only a non-secret reason in `metadata.reauthorizationReason`, and emit no credential value.

- [ ] **Step 5: Add fake broker contract tests**

`test/support/fake-token-broker.ts` must listen on a random local port, accept only `POST /v1/token-leases`, require a fixture service bearer, return a fixed token to the adapter process, and record requests after replacing the authorization header with `[REDACTED]`. Test broker 401, malformed lease, timeout, and successful lease; assert no serialized result from `ConnectionService` contains the fixture token.

- [ ] **Step 6: Run gates and commit**

```bash
npx tsx --test packages/connections/test/connections.test.ts
npm run typecheck
npm run scan:secrets
git add packages/connections test/support/fake-token-broker.ts package.json package-lock.json
git commit -m "feat: add persistent connection gateway contract"
```

---

### Task 6: Add Encrypted, Redacted Observation Payload Storage

**Files:**
- Create: `packages/payloads/package.json`
- Create: `packages/payloads/tsconfig.json`
- Create: `packages/payloads/src/redact.ts`
- Create: `packages/payloads/src/crypto.ts`
- Create: `packages/payloads/src/repository.ts`
- Create: `packages/payloads/src/index.ts`
- Test: `packages/payloads/test/payloads.test.ts`

**Interfaces:**
- Consumes: 32-byte base64 `PAYLOAD_ENCRYPTION_KEY_B64`, PostgreSQL client, arbitrary provider payload.
- Produces: `redactSecrets(value)`, `encryptPayload(value, key)`, `PayloadRepository.put()`, `PayloadRepository.get()`, and `PayloadRepository.markDeleted()`.

- [ ] **Step 1: Write failing redaction/encryption tests**

```ts
// packages/payloads/test/payloads.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptPayload, encryptPayload, redactSecrets } from '../src/index.ts';

const key = Buffer.alloc(32, 7);
test('nested provider secrets are removed before hashing or encryption', () => {
  const redacted = redactSecrets({ project: { id: 1 }, authorization: 'Bearer private', refresh_token: 'private' });
  assert.deepEqual(redacted, { project: { id: 1 }, authorization: '[REDACTED]', refresh_token: '[REDACTED]' });
});
test('AES-GCM round trip preserves only redacted payload', () => {
  const encrypted = encryptPayload({ id: 1, access_token: 'private' }, key, 'payload-key-v1');
  assert.deepEqual(decryptPayload(encrypted, key), { id: 1, access_token: '[REDACTED]' });
  assert.equal(encrypted.ciphertext.includes('private'), false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test packages/payloads/test/payloads.test.ts`

Expected: FAIL because payload functions do not exist.

- [ ] **Step 3: Implement recursive redaction and AES-256-GCM**

```ts
// packages/payloads/src/redact.ts
const SECRET_KEY = /^(authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|api[_-]?token|client[_-]?secret|password|mfa|otp)$/i;
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(item)]));
  }
  return value;
}
```

```ts
// packages/payloads/src/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { canonicalJson, hashCanonical } from '@acquisition-fabric/contracts';
import { redactSecrets } from './redact.ts';
export function encryptPayload(value: unknown, key: Buffer, keyVersion: string) {
  if (key.length !== 32) throw new TypeError('PAYLOAD_KEY_MUST_BE_32_BYTES');
  const redacted = redactSecrets(value); const plaintext = Buffer.from(canonicalJson(redacted));
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion, payloadHash: hashCanonical(redacted) };
}
export function decryptPayload(input: ReturnType<typeof encryptPayload>, key: Buffer): unknown {
  const decipher = createDecipheriv('aes-256-gcm', key, input.iv); decipher.setAuthTag(input.authTag);
  return JSON.parse(Buffer.concat([decipher.update(input.ciphertext), decipher.final()]).toString('utf8'));
}
```

`PayloadRepository.put()` must generate `payload:<payloadHash>:<uuid>`, insert encrypted bytes, and return `{ payloadRef, payloadHash }`. `get()` must reject deleted payloads. `markDeleted()` sets `deleted_at` while preserving row, hash, and provenance reference.

- [ ] **Step 4: Run tests and commit**

```bash
npx tsx --test packages/payloads/test/payloads.test.ts
npm run typecheck
npm run scan:secrets
git add packages/payloads package.json package-lock.json
git commit -m "feat: add encrypted observation payload storage"
```

---

### Task 7: Implement the Freelancer Read Adapter Against the Owner's OAuth Broker

**Files:**
- Create: `packages/provider-freelancer/package.json`
- Create: `packages/provider-freelancer/tsconfig.json`
- Create: `packages/provider-freelancer/src/client.ts`
- Create: `packages/provider-freelancer/src/normalize.ts`
- Create: `packages/provider-freelancer/src/adapter.ts`
- Create: `packages/provider-freelancer/src/index.ts`
- Create: `test/support/fake-freelancer-api.ts`
- Test: `packages/provider-freelancer/test/adapter.test.ts`

**Interfaces:**
- Consumes: `TokenBrokerClient`, `ConnectionRecord`, `FREELANCER_API_BASE`, live cursor `{ version: 1, recentExternalIds: string[], lastCompletedAt: string | null }`.
- Produces: `FreelancerAdapter implements ProviderAdapter`; verified `marketplace_project` / `buyer_opportunity` observations and explicit health/failure states.

- [ ] **Step 1: Write failing adapter tests**

```ts
// packages/provider-freelancer/test/adapter.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { FreelancerAdapter } from '../src/index.ts';

test('verified active projects become immutable buyer observations', async () => {
  const adapter = fixtureAdapterWithProjects([{ id: 42, title: 'Build an AI CRM', description: 'Paid implementation', owner_id: 9, budget: { minimum: 500, maximum: 1500 }, currency: { code: 'USD' }, jobs: [{ name: 'Node.js' }] }]);
  const result = await adapter.collect(fixtureRequest());
  assert.equal(result.failureCode, null);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.observation.externalId, '42');
  assert.equal(result.observations[0]?.observation.recordKind, 'buyer_opportunity');
  assert.equal(result.observations[0]?.observation.verified, true);
});

test('401 emits zero verified observations and AUTH_REQUIRED', async () => {
  const result = await fixtureAdapterWithStatus(401).collect(fixtureRequest());
  assert.deepEqual(result.observations, []);
  assert.equal(result.healthAfter, 'AUTH_REQUIRED');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test packages/provider-freelancer/test/adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the official active-project client**

```ts
// packages/provider-freelancer/src/client.ts
export class FreelancerClient {
  constructor(private readonly apiBase: string, private readonly fetchFn: typeof fetch = fetch) {}
  async listActiveProjects(accessToken: string, limit: number): Promise<unknown> {
    const url = new URL(`${this.apiBase.replace(/\/$/, '')}/projects/0.1/projects/active/`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('compact', 'true');
    url.searchParams.set('full_description', 'true');
    url.searchParams.set('job_details', 'true');
    const response = await this.fetchFn(url, {
      headers: { authorization: `Bearer ${accessToken}`, 'user-agent': 'AcquisitionFabric/0.1' },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw Object.assign(new Error(`FREELANCER_HTTP_${response.status}`), { status: response.status });
    return response.json();
  }
}
```

- [ ] **Step 4: Normalize source records without fabricating values**

`normalize.ts` must structurally require project `id` and nonblank `title`; preserve nullable description, budget, currency, bid count, skills, owner, deadline, canonical project URL, and provider update timestamp when supplied. It must compute:

```ts
const contentFingerprint = hashCanonical({
  id, title, description, budgetMin, budgetMax, currency, bidCount, skills,
  employerId, deadline, sourceRevision
});
const observationId = `obs_freelancer_${id}_${contentFingerprint.slice(0, 16)}`;
```

The payload supplied to persistence is the structurally validated project object. Do not place the access token or request headers in the payload.

- [ ] **Step 5: Implement fail-closed collection and bounded live cursor**

`FreelancerAdapter.collect()` must:

1. require `connection.provider === 'freelancer'`, `secretRef`, and `read_projects` capability;
2. request a short-lived token lease from the broker;
3. call the official active-project endpoint with `limit` bounded to `1..100`;
4. classify `401/403` as `AUTH_REQUIRED`, `429` as `RATE_LIMITED`, timeout/network as `UNAVAILABLE`, malformed JSON/shape as `SCHEMA_DRIFT`;
5. return zero observations for every unsuccessful state;
6. create a cursor containing the newest bounded 500 external IDs and `lastCompletedAt`;
7. mark records already in the prior `recentExternalIds` as collection-level duplicates only when their content fingerprint is unchanged; changed content must emit a new observation revision;
8. return source permissions `{ read_projects: true, submit_application: false }`.

- [ ] **Step 6: Add fixture cases and run gates**

Test verified empty results, malformed top-level response, one invalid record among valid records, duplicate replay, changed project revision, broker timeout, API timeout, 429, and secret non-leakage. Then run:

```bash
npx tsx --test packages/provider-freelancer/test/adapter.test.ts
npm run typecheck
npm run scan:secrets
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/provider-freelancer test/support/fake-freelancer-api.ts package.json package-lock.json
git commit -m "feat: add broker-backed freelancer collector"
```

---

### Task 8: Build Distributed Leases, Bounded Backoff, and the Atomic Ingestion Commit

**Files:**
- Create: `packages/ingestion/package.json`
- Create: `packages/ingestion/tsconfig.json`
- Create: `packages/ingestion/src/leases.ts`
- Create: `packages/ingestion/src/backoff.ts`
- Create: `packages/ingestion/src/repository.ts`
- Create: `packages/ingestion/src/runner.ts`
- Create: `packages/ingestion/src/index.ts`
- Test: `packages/ingestion/test/leases.test.ts`
- Test: `packages/ingestion/test/runner.test.ts`

**Interfaces:**
- Consumes: provider adapter registry, `PayloadRepository`, PostgreSQL, `collector_partitions`.
- Produces: `leaseNextPartition()`, `computeRetryDelaySeconds()`, `IngestionRepository.commitSuccess()`, `commitFailure()`, and `runPartitionOnce()`.

- [ ] **Step 1: Write failing concurrent lease and cursor-atomicity tests**

```ts
// packages/ingestion/test/leases.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { leaseNextPartition } from '../src/index.ts';
import { seedDuePartition, freshDatabase } from '../../../test/support/database.ts';

test('two workers cannot own the same due partition', async () => {
  const db = await freshDatabase(); await seedDuePartition(db.pool, 'freelancer_live');
  const [a, b] = await Promise.all([
    leaseNextPartition(db.pool, { workerId: 'a', now: new Date('2026-08-24T12:00:00Z'), leaseSeconds: 30 }),
    leaseNextPartition(db.pool, { workerId: 'b', now: new Date('2026-08-24T12:00:00Z'), leaseSeconds: 30 })
  ]);
  assert.equal([a, b].filter(Boolean).length, 1);
  await db.close();
});
```

```ts
// packages/ingestion/test/runner.test.ts
test('cursor and outbox do not advance when observation persistence fails', async () => {
  const before = await getPartitionCursor(pool, 'freelancer_live');
  await assert.rejects(() => runPartitionOnce(fixtureWithForcedPayloadInsertFailure()));
  assert.deepEqual(await getPartitionCursor(pool, 'freelancer_live'), before);
  assert.equal(await countRows(pool, 'outbox_events'), 0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test packages/ingestion/test/*.test.ts`

Expected: FAIL because ingestion functions do not exist.

- [ ] **Step 3: Implement lease acquisition with `SKIP LOCKED`**

```sql
with candidate as (
  select id from collector_partitions
  where state='ENABLED' and next_run_at <= $1
    and (lease_expires_at is null or lease_expires_at <= $1)
  order by case lane when 'LIVE' then 0 else 1 end, next_run_at, id
  for update skip locked limit 1
)
update collector_partitions p
set lease_owner=$2, lease_expires_at=$1 + ($3 || ' seconds')::interval, updated_at=$1
from candidate where p.id=candidate.id
returning p.*;
```

`leaseNextPartition()` must execute this inside a transaction. A worker may extend or release only a lease it owns.

- [ ] **Step 4: Implement bounded retry policy**

```ts
// packages/ingestion/src/backoff.ts
export function computeRetryDelaySeconds(failureCount: number, random: () => number = Math.random): number {
  if (!Number.isInteger(failureCount) || failureCount < 1) throw new TypeError('FAILURE_COUNT_INVALID');
  const base = Math.min(300, 5 * (2 ** Math.min(failureCount - 1, 6)));
  return Math.max(5, Math.round(base * (0.8 + random() * 0.4)));
}
```

After eight consecutive failures, `commitFailure()` must preserve the run and add a dead-letter row; it must not disable collection automatically. `AUTH_REQUIRED`, `POLICY_BLOCKED`, and `CURSOR_INVALID` schedule a slow recheck and surface connection health rather than tight retries.

- [ ] **Step 5: Implement the atomic success transaction**

Within one `withTransaction()` callback:

1. store each redacted/encrypted payload;
2. insert the collector run and computed immutable receipt;
3. insert observations with `on conflict do nothing` and count duplicates;
4. insert one `ObservationPersisted` outbox event per newly inserted observation;
5. update `collector_partitions.cursor`, `last_receipt_hash`, `next_run_at`, failure count, and release lease;
6. update connection health and `last_verified_at`.

Compute `receiptHash = hashCanonical(receiptWithoutReceiptHash)`. No cursor update may occur outside this transaction.

- [ ] **Step 6: Implement failure commit and uncertain-state behavior**

A failed collection writes `collector_runs` with zero verified observations and a failure receipt, updates explicit health, schedules retry, and releases the lease. A database failure propagates without releasing through a false success path; the lease expires naturally for recovery.

- [ ] **Step 7: Run tests and commit**

```bash
npx tsx --test packages/ingestion/test/*.test.ts
npm run typecheck
npm run scan:secrets
git add packages/ingestion package.json package-lock.json
git commit -m "feat: add durable ingestion runtime"
```

---

### Task 9: Add the 15-Second Live Scheduler and Versioned Freelancer Partition

**Files:**
- Create: `packages/ingestion/src/scheduler.ts`
- Create: `config/freelancer-live.v1.json`
- Create: `scripts/seed-freelancer-partition.ts`
- Test: `packages/ingestion/test/scheduler.test.ts`

**Interfaces:**
- Consumes: `runPartitionOnce()`, adapter registry, connection ID.
- Produces: `startScheduler({ tickMs, workerId, adapters, signal })` and an idempotent `freelancer:active:live:v1` partition with `cadenceSeconds: 15`.

- [ ] **Step 1: Write the failing scheduler test**

```ts
// packages/ingestion/test/scheduler.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { runSchedulerTick } from '../src/scheduler.ts';

test('live lane is leased before backfill and never overlaps itself', async () => {
  const executed = [] as string[];
  await runSchedulerTick(fixtureScheduler({ onRun: async (partition) => executed.push(partition.id) }));
  assert.deepEqual(executed, ['freelancer:active:live:v1']);
});
```

- [ ] **Step 2: Create the exact live policy**

```json
// config/freelancer-live.v1.json
{
  "id": "freelancer:active:live:v1",
  "provider": "freelancer",
  "queryKey": "active-projects-global",
  "cadenceSeconds": 15,
  "lane": "LIVE",
  "limit": 100,
  "retrievalPolicyVersion": "freelancer-active-v1",
  "localAdmission": "persist-verified-buyer-projects; defer commercial filtering to OpportunityOS"
}
```

This deliberately ingests verified active projects broadly enough not to miss inventory. Notification narrowing remains downstream and does not reduce source coverage.

- [ ] **Step 3: Implement scheduler lifecycle**

`startScheduler()` ticks every `1000ms`, leases at most one due partition per tick, starts collection, and immediately continues polling for other partitions without starting the same leased partition twice. It must stop cleanly on `AbortSignal`, finish in-flight database commits, and expose counters for last successful run, last failure, and lease conflicts.

- [ ] **Step 4: Implement idempotent partition seeding**

`scripts/seed-freelancer-partition.ts` reads the JSON config and executes `insert ... on conflict(id) do update` for non-cursor policy fields while preserving existing cursor and receipt chain. It requires a healthy or pending Freelancer connection ID argument.

- [ ] **Step 5: Verify cadence and commit**

Use a fake clock to assert a successful run schedules `next_run_at = completed_at + 15 seconds`; a rate-limited run uses backoff instead. Then run and commit:

```bash
npx tsx --test packages/ingestion/test/scheduler.test.ts
npm run typecheck
git add packages/ingestion config scripts/seed-freelancer-partition.ts
git commit -m "feat: schedule freelancer live ingestion"
```

---

### Task 10: Materialize Canonical Opportunities, Revisions, Dedup Decisions, and Field Provenance

**Files:**
- Create: `packages/ledger/package.json`
- Create: `packages/ledger/tsconfig.json`
- Create: `packages/ledger/src/identity.ts`
- Create: `packages/ledger/src/repository.ts`
- Create: `packages/ledger/src/materializer.ts`
- Create: `packages/ledger/src/worker.ts`
- Create: `packages/ledger/src/index.ts`
- Test: `packages/ledger/test/materializer.test.ts`
- Test: `packages/ledger/test/replay.test.ts`

**Interfaces:**
- Consumes: `ObservationPersisted` outbox events, encrypted payload repository, source observations.
- Produces: `canonicalizeSourceUrl()`, `materializeObservation()`, `splitAlias()`, `runLedgerBatch()`, canonical opportunity/revision/provenance queries, and durable consumer offset `ledger-materializer-v1`.

- [ ] **Step 1: Write failing dedup/provenance tests**

```ts
// packages/ledger/test/materializer.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeObservation } from '../src/index.ts';

test('same provider external id revises one opportunity', async () => {
  const first = await persistFixtureObservation({ externalId: '42', title: 'Build CRM', sourceRevision: '1' });
  const second = await persistFixtureObservation({ externalId: '42', title: 'Build AI CRM', sourceRevision: '2' });
  const a = await materializeObservation(fixtureContext(), first.id);
  const b = await materializeObservation(fixtureContext(), second.id);
  assert.equal(a.opportunityId, b.opportunityId);
  assert.equal(await opportunityRevisionCount(a.opportunityId), 2);
  assert.deepEqual(await evidenceForField(a.opportunityId, 2, 'title'), [second.id]);
});

test('semantic resemblance alone never silently merges', async () => {
  const a = await materializeFixture({ provider: 'freelancer', externalId: '1', title: 'Build AI CRM' });
  const b = await materializeFixture({ provider: 'github', externalId: '99', title: 'Need AI CRM built' });
  assert.notEqual(a.opportunityId, b.opportunityId);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test packages/ledger/test/*.test.ts`

Expected: FAIL because ledger functions do not exist.

- [ ] **Step 3: Implement safe identities**

```ts
// packages/ledger/src/identity.ts
export function canonicalizeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  const url = new URL(value); url.hostname = url.hostname.toLowerCase(); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}
export const providerExternalAlias = (provider: string, connectionId: string | null, externalId: string) =>
  `${provider}\u0000${connectionId ?? ''}\u0000${externalId}`;
```

- [ ] **Step 4: Implement deterministic materialization order**

Within one transaction, `materializeObservation()` must search active aliases in this order:

1. exact `PROVIDER_EXTERNAL_ID` within provider/connection context;
2. exact normalized `CANONICAL_URL`;
3. exact `CONTENT_WINDOW` fingerprint for the same provider within 24 hours.

If none matches, create `opp_<uuid>`, revision 1, `CREATE` decision, aliases, direct evidence links, and `OpportunityCreated` outbox event. If a match exists and material fields changed, append the next revision, record `LINK`, update the materialized opportunity, add field-level evidence links, and emit `OpportunityRevised`. If nothing changed, link the observation without creating a duplicate revision.

Field extraction for Freelancer payloads must preserve nulls and support: `title`, `description`, `budget.minimum`, `budget.maximum`, `currency.code`, and `deadline`. Each populated field gets `DIRECT` evidence. Each absent field gets an `UNKNOWN` evidence row with the observation as input context, not a false zero.

- [ ] **Step 5: Add reversible alias split**

`splitAlias(aliasId, actor, evidenceRefs)` retires the selected alias, creates a new opportunity from its observation, adds a `SPLIT` decision, preserves every old observation/decision/revision, and emits `OpportunitySplit`. Reject empty evidence references.

- [ ] **Step 6: Implement durable outbox consumption**

`runLedgerBatch(pool, limit=100)` must lock the `consumer_offsets` row for `ledger-materializer-v1`, read `ObservationPersisted` events with `id > last_outbox_id`, materialize in ascending ID order, and update the offset in the same transaction as each materialization. Replaying the same batch must create no duplicate revision.

- [ ] **Step 7: Run ledger gates and commit**

Test exact source-ID dedup, URL dedup, content-window dedup, changed revision, semantic non-merge, replay, alias split, null preservation, and provenance. Then:

```bash
npx tsx --test packages/ledger/test/*.test.ts
npm run typecheck
git add packages/ledger package.json package-lock.json
git commit -m "feat: materialize canonical opportunity ledger"
```

---

### Task 11: Expose Scoped HTTP Query, Event, Health, and Reauthorization APIs

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/routes.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/main.ts`
- Test: `apps/api/test/http.test.ts`

**Interfaces:**
- Consumes: auth, connection, observation, ledger, pursuit, and outbox repositories.
- Produces: authenticated `/v1` API and health endpoints. No provider write route exists.

- [ ] **Step 1: Write failing route/scope tests**

```ts
// apps/api/test/http.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.ts';

test('two read-scoped agents receive the same canonical opportunity', async () => {
  const app = createApp(fixtureDependencies());
  const chatgpt = await request(app).get('/v1/opportunities/opp_1').set('authorization', `Bearer ${tokens.chatgpt}`);
  const grok = await request(app).get('/v1/opportunities/opp_1').set('authorization', `Bearer ${tokens.grok}`);
  assert.equal(chatgpt.status, 200); assert.deepEqual(chatgpt.body, grok.body);
});

test('opportunity read scope cannot mutate connection state', async () => {
  const result = await request(createApp(fixtureDependencies()))
    .post('/v1/connections/conn_1/reauthorization-requests')
    .set('authorization', `Bearer ${tokens.readOnly}`);
  assert.equal(result.status, 403);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test apps/api/test/http.test.ts`

Expected: FAIL because API app does not exist.

- [ ] **Step 3: Add exact routes and scopes**

```text
GET  /health                                      public liveness; no account data
GET  /ready                                       database/migration readiness only
GET  /v1/connections                              connections:read
GET  /v1/connections/:id/health                   connections:read
GET  /v1/observations?after=&limit=                observations:read
GET  /v1/opportunities?q=&status=&limit=           opportunities:read
GET  /v1/opportunities/:id                        opportunities:read
GET  /v1/opportunities/:id/provenance             opportunities:read
GET  /v1/events?after=&limit=                      events:read
GET  /v1/pursuits                                 pursuits:read
GET  /v1/pursuits/:id/receipt                     pursuits:read
PUT  /v1/internal/connections/:id                 connections:write
POST /v1/connections/:id/reauthorization-requests connections:reauthorize
```

Every list route must cap `limit` to `1..200`, use stable cursor ordering, and return `{ items, nextCursor }`. Connection results must parse through the strict schema and must not select or serialize agent token hashes. Observation list results exclude encrypted payload bytes; full payload retrieval is not model-visible in v1.

- [ ] **Step 4: Implement fail-closed middleware**

`auth.ts` must accept `Authorization: Bearer af_...`, authenticate hash-only credentials, attach `AgentPrincipal`, reject missing/invalid/expired/revoked bearer with 401, and reject insufficient scope with 403. Never log the header.

- [ ] **Step 5: Add route tests and commit**

Test stable pagination, 404s, malformed limit, database unavailable readiness, secret non-serialization, reauthorization event emission, and identical cross-agent results. Then:

```bash
npm install express zod --workspace apps/api
npm install -D @types/express supertest @types/supertest --workspace apps/api
npx tsx --test apps/api/test/http.test.ts
npm run typecheck
npm run scan:secrets
git add apps/api package.json package-lock.json
git commit -m "feat: expose authenticated acquisition query API"
```

---

### Task 12: Add the Shared Streamable-HTTP MCP Surface

**Files:**
- Create: `apps/api/src/mcp.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/mcp.test.ts`

**Interfaces:**
- Consumes: authenticated `AgentPrincipal` and the same query services used by HTTP routes.
- Produces: `/mcp` with read tools `list_connections`, `get_connection_health`, `list_recent_observations`, `search_opportunities`, `get_opportunity`, `get_opportunity_provenance`, `list_pursuits`, `get_pursuit_receipt`, plus governed `request_connection_reauthorization`.

- [ ] **Step 1: Write failing MCP registration and scope tests**

```ts
// apps/api/test/mcp.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpServer } from '../src/mcp.ts';

test('v1 MCP exposes read tools but no pursuit execution tool', async () => {
  const server = createMcpServer(fixturePrincipal(['opportunities:read']), fixtureServices());
  const names = await listRegisteredToolNames(server);
  for (const name of ['search_opportunities', 'get_opportunity', 'get_opportunity_provenance']) assert.ok(names.includes(name));
  assert.equal(names.includes('execute_authorized_pursuit'), false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test apps/api/test/mcp.test.ts`

Expected: FAIL because `createMcpServer` does not exist.

- [ ] **Step 3: Register strict, read-mostly tools**

Use `McpServer` and `StreamableHTTPServerTransport` following the established OpportunityOS BuildGraph MCP pattern. Each tool must use Zod input schemas, `readOnlyHint: true` for reads, return both text JSON and `structuredContent`, and call the identical service method used by HTTP. `request_connection_reauthorization` must declare `readOnlyHint: false`, require `connections:reauthorize`, and only change Fabric connection state; it must not start OAuth itself or expose a provider credential.

- [ ] **Step 4: Mount authenticated transport**

```ts
app.all('/mcp', authenticateAgent, async (req, res) => {
  const server = createMcpServer(req.agentPrincipal, services);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

Do not allow anonymous MCP. Do not include raw payload content, secret references beyond opaque IDs, token hashes, or provider credentials in tool results.

- [ ] **Step 5: Run tests and commit**

```bash
npm install @modelcontextprotocol/sdk cors --workspace apps/api
npm install -D @types/cors --workspace apps/api
npx tsx --test apps/api/test/mcp.test.ts
npm run typecheck
npm run scan:secrets
git add apps/api package.json package-lock.json
git commit -m "feat: expose shared acquisition fabric mcp"
```

---

### Task 13: Assemble the Continuous Worker and Health Surface

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/health.ts`
- Create: `apps/worker/src/main.ts`
- Test: `apps/worker/test/worker.test.ts`

**Interfaces:**
- Consumes: PostgreSQL, token broker, Freelancer adapter, ingestion scheduler, ledger batch worker.
- Produces: one long-running process that continuously collects due partitions and drains ledger events, plus `/health` and `/ready` on an internal port.

- [ ] **Step 1: Write the failing composition test**

```ts
// apps/worker/test/worker.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorker } from '../src/main.ts';

test('worker registers freelancer and keeps writes disabled', () => {
  const worker = buildWorker(fixtureEnvironment());
  assert.deepEqual(worker.adapterProviders, ['freelancer']);
  assert.equal(worker.writeActionsEnabled, false);
  assert.equal(worker.freelancerCadenceSeconds, 15);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test apps/worker/test/worker.test.ts`

Expected: FAIL because worker composition does not exist.

- [ ] **Step 3: Compose dependencies explicitly**

`buildWorker()` must validate required environment, create the pool, broker client, payload repository, connection service, Freelancer adapter, ingestion runner, scheduler, and ledger worker. It must reject startup when `WRITE_ACTIONS_ENABLED` is anything other than `false`; this tranche has no write adapter registration.

The main loop runs scheduler ticks continuously and runs `runLedgerBatch()` after each successful ingestion and every second as reconciliation. SIGTERM/SIGINT abort new leases, await in-flight commit, close health server, and end the pool.

- [ ] **Step 4: Expose non-sensitive health**

`/health` returns process liveness and version only. `/ready` verifies database access, migrations, worker ID, and adapter registration; it may return provider health state but never account payloads, `secretRef`, broker URL bearer, or token lease.

- [ ] **Step 5: Run tests and commit**

```bash
npm install express --workspace apps/worker
npm install -D @types/express --workspace apps/worker
npx tsx --test apps/worker/test/worker.test.ts
npm run typecheck
git add apps/worker package.json package-lock.json
git commit -m "feat: assemble continuous acquisition worker"
```

---

### Task 14: Containerize the API and Worker for Managed Always-On Deployment

**Files:**
- Create: `deploy/Dockerfile.api`
- Create: `deploy/Dockerfile.worker`
- Create: `deploy/compose.yaml`
- Create: `deploy/README.md`
- Test: `test/container-config.test.ts`

**Interfaces:**
- Consumes: OCI-compatible runtime, managed PostgreSQL, managed secret injection.
- Produces: separate API and worker images with health checks and no local-device dependency.

- [ ] **Step 1: Write failing deployment-config test**

```ts
// test/container-config.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('deployment keeps provider writes disabled and separates API from worker', () => {
  const compose = readFileSync('deploy/compose.yaml', 'utf8');
  assert.match(compose, /WRITE_ACTIONS_ENABLED:\s*["']?false/);
  assert.match(compose, /api:/); assert.match(compose, /worker:/);
  assert.doesNotMatch(compose, /FREELANCER_ACCESS_TOKEN/);
});
```

- [ ] **Step 2: Create multi-stage images**

Both Dockerfiles must use Node 22, run `npm ci`, build the workspace, copy only production dependencies and `dist`, run as a non-root user, and define health checks. API command starts `apps/api/dist/main.js`; worker command starts `apps/worker/dist/main.js`.

- [ ] **Step 3: Create local composition without pretending it is production**

`compose.yaml` includes PostgreSQL 16, API, worker, and optional fake broker profile. It injects `WRITE_ACTIONS_ENABLED: "false"`, mounts no home directories, stores PostgreSQL in a named volume, and accepts broker/encryption values from environment. It is for verification only; `deploy/README.md` must state that production requires a managed container runtime, managed PostgreSQL, managed secret store, TLS ingress, and centralized logs.

- [ ] **Step 4: Build and verify**

Run:

```bash
npx tsx --test test/container-config.test.ts
docker build -f deploy/Dockerfile.api -t acquisition-fabric-api:test .
docker build -f deploy/Dockerfile.worker -t acquisition-fabric-worker:test .
docker compose -f deploy/compose.yaml config
```

Expected: both images build; compose config validates; no provider token environment variable exists.

- [ ] **Step 5: Commit**

```bash
git add deploy test/container-config.test.ts
git commit -m "ops: package acquisition fabric for managed runtime"
```

---

### Task 15: Add Cross-Agent and OpportunityOS-Compatible End-to-End Acceptance

**Files:**
- Create: `scripts/smoke.ts`
- Create: `test/end-to-end.test.ts`
- Create: `README.md` operational sections
- Create: `docs/freelancer-token-broker-contract.md`
- Create: `docs/operations.md`

**Interfaces:**
- Consumes: fake OAuth broker, fake Freelancer API, PostgreSQL, API, MCP, worker.
- Produces: evidence that one shared connection and one canonical opportunity are visible consistently to four agents and are not duplicated on replay or restart.

- [ ] **Step 1: Write the failing end-to-end scenario**

```ts
// test/end-to-end.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('one OAuth connection feeds one replay-safe opportunity visible to four agents', async () => {
  const system = await startFixtureFabric();
  await system.registerFreelancerConnection();
  await system.seedLivePartition();
  await system.runCollectionOnce();
  await system.runLedgerOnce();
  const ids = await Promise.all(['chatgpt', 'grok', 'manus', 'opportunityos'].map((agent) => system.getOpportunityId(agent)));
  assert.equal(new Set(ids).size, 1);
  await system.runCollectionOnce(); await system.runLedgerOnce();
  assert.equal(await system.observationCount(), 1);
  assert.equal(await system.opportunityCount(), 1);
  assert.equal(await system.revisionCount(ids[0]!), 1);
  assert.equal(await system.providerSecretLeakCount(), 0);
  await system.close();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test test/end-to-end.test.ts`

Expected: FAIL because the fixture fabric orchestration and smoke script do not exist.

- [ ] **Step 3: Implement the exact acceptance fixture**

The fake broker returns a token only to the worker. The fake Freelancer API returns two verified projects on run 1; run 2 repeats one unchanged project and returns a changed revision for the other. Assertions after two runs:

- `3` immutable source observations: project A v1, project B v1, project B v2;
- `2` canonical opportunities;
- project A has `1` revision;
- project B has `2` revisions;
- all four agent credentials return the same IDs and provenance;
- raw bearer tokens, broker service bearer, and fixture provider token occur zero times in database text exports, logs, HTTP/MCP responses, hashes, receipts, and tracked files;
- collector receipt chain is continuous;
- cursor advanced only after committed observations;
- `WRITE_ACTIONS_ENABLED=false` and there is no provider execution function/tool.

- [ ] **Step 4: Add a timing assertion appropriate to fixture infrastructure**

Measure `runCollectionOnce()` from request start through durable observation/outbox commit. Require fixture P95 `< 2 seconds` across 20 runs. Document that production P95 `<=30 seconds` includes the configured 15-second schedule plus provider/network latency and must be measured after managed deployment; do not claim a live production SLO from fixture timing.

- [ ] **Step 5: Document the owner's OAuth integration contract**

`docs/freelancer-token-broker-contract.md` must specify:

```http
POST /v1/token-leases
Authorization: Bearer <service-to-service-secret>
Content-Type: application/json

{
  "provider": "freelancer",
  "connectionId": "conn_freelancer_nic",
  "secretRef": "broker://freelancer/conn_freelancer_nic",
  "audience": "acquisition-fabric",
  "requestedScopes": ["read_projects"]
}
```

Success returns `{ accessToken, tokenType: "Bearer", expiresAt, providerAccountId, scopes }`; 401/403/409/429/5xx semantics are explicit. State that `accessToken` is consumed in memory and prohibited from every persisted/model-visible surface.

- [ ] **Step 6: Run every verification gate**

```bash
npm run scan:secrets
npm run typecheck
npm test
npm run build
npm run smoke
docker build -f deploy/Dockerfile.api -t acquisition-fabric-api:test .
docker build -f deploy/Dockerfile.worker -t acquisition-fabric-worker:test .
```

Expected: all commands PASS.

- [ ] **Step 7: Commit and open the foundation PR**

```bash
git add .
git commit -m "test: verify shared acquisition fabric foundation"
git push -u origin codex/foundation-v1
gh pr create \
  --repo Full-Stack-Assets/AcquisitionFabric \
  --base main \
  --head codex/foundation-v1 \
  --title "Build shared acquisition fabric foundation v1" \
  --body "Implements approved Tranches A-C plus the Freelancer token-broker integration boundary. Provider application writes remain disabled and absent."
```

---

## Execution Stop Boundary

Stop this plan after the foundation PR is verified. Do **not** add:

- Freelancer bid/application submission;
- proposal generation;
- marketplace messaging;
- contract acceptance;
- milestones or payments;
- paid credits/connects;
- Gmail, Reddit, Contra, or expanded GitHub adapters;
- OpportunityOS autonomous-pursuit decision code.

Those belong to later Tranches D-F after the shared substrate proves durable, secret-safe, replay-safe, and cross-agent consistent.

## Plan Self-Review

### Spec coverage

- Tranche A: Tasks 1-4 freeze contracts, create the private repository, CI, schema, secret scan, and agent auth.
- Tranche B Freelancer integration: Tasks 5 and 7 integrate the owner's canonical OAuth broker without a competing token store.
- Tranche C ingestion and ledger: Tasks 6, 8-10 implement encrypted observations, leases, cursors, receipts, outbox, deduplication, revisions, and provenance.
- Cross-agent access: Tasks 11-12 expose identical scoped HTTP and MCP reads.
- Managed-runtime shape: Tasks 13-14 produce continuous worker/API containers without an owner-operated device.
- First-plan acceptance: Task 15 proves persistent connection metadata, replay safety, canonical identity, provenance, and four-agent consistency.
- Provider writes remain excluded exactly as required.

### Placeholder scan

The plan contains no `TBD`, `TODO`, “implement later,” or unbound function names. Environment-specific secret values are intentionally supplied through managed runtime configuration; their interfaces and validation rules are exact.

### Type/interface consistency

- `ConnectionRecord` is defined once in `@acquisition-fabric/contracts` and consumed by connections, adapters, API, and worker.
- `TokenBrokerClient.issueAccessLease()` is the only provider-token acquisition interface.
- `ProviderAdapter.collect()` returns source observation plus payload pairs consumed by `runPartitionOnce()`.
- `PayloadRepository.put()` returns `payloadRef` and `payloadHash` required by `SourceObservation` persistence.
- `ObservationPersisted` is the sole first-plan ledger input event.
- HTTP and MCP call the same repository/service methods, preventing divergent cross-agent results.
- No task references a provider write interface because the first implementation plan explicitly stops before it.
