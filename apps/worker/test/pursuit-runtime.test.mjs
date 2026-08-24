import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExecutorRouter,
  InMemoryCredentialBroker,
  InMemorySessionBroker,
  compilePreparedApplication,
} from '@opportunityos/core';
import { PursuitRuntime } from '../src/pursuit-runtime.ts';

function application() {
  return compilePreparedApplication({
    opportunityId: 'opp-1',
    pursuitId: 'pursuit-1',
    targetPlatform: 'freelancer',
    targetUrl: 'https://www.freelancer.com/projects/123',
    applicantIdentityRef: 'identity://nic',
    answers: [],
    portfolioRefs: [],
    expectedCost: { requiresPurchase: false },
    requiredUploads: [],
    preparedAt: '2026-08-24T15:00:00Z',
    expiresAt: '2026-08-25T15:00:00Z',
  });
}

function action() {
  return {
    actionId: 'pursuit-1:submit',
    approvalRef: 'approval-1',
    idempotencyKey: 'idem-1',
    application: application(),
    route: { executorType: 'official_api', platform: 'freelancer', accountRef: 'acct://freelancer/nic', credentialRef: 'cred://freelancer/nic' },
    mode: 'LIVE_AUTHORIZED',
  };
}

function deps(counter) {
  const executor = {
    inspect: async (target) => ({ targetPlatform: target.platform, targetUrl: target.url, fields: [], expectedCost: { requiresPurchase: false }, inspectedAt: '2026-08-24T16:00:00Z' }),
    validate: async () => ({ allowed: true, canExecuteWrite: true, status: 'EXECUTED_UNVERIFIED' }),
    execute: async (authorized) => {
      counter.count += 1;
      return { actionId: authorized.actionId, status: 'EXECUTED_UNVERIFIED', executorType: 'official_api', platform: 'freelancer', attemptedAt: '2026-08-24T16:00:00Z', externalId: 'bid-1' };
    },
  };
  return {
    router: new ExecutorRouter([{ platform: 'freelancer', executorType: 'official_api', executor }]),
    credentialBroker: new InMemoryCredentialBroker([{ ref: 'cred://freelancer/nic', platform: 'freelancer', accountRef: 'acct://freelancer/nic', kind: 'oauth', leaseId: 'lease-1', expiresAt: '2026-08-25T00:00:00Z' }]),
    sessionBroker: new InMemorySessionBroker(),
    verifier: { verify: async (_app, execution) => ({ actionId: execution.actionId, verified: true, status: 'SUBMITTED_VERIFIED', verifiedAt: '2026-08-24T16:00:01Z', externalId: execution.externalId, evidenceRefs: ['evidence://bid-1'] }) },
  };
}

test('live writes are disabled by default even with a valid authorized action', async () => {
  const counter = { count: 0 };
  const runtime = new PursuitRuntime(deps(counter));
  const result = await runtime.run(action());
  assert.equal(result.status, 'NEEDS_HUMAN_AUTH');
  assert.equal(counter.count, 0);
  assert.equal(result.reason, 'LIVE_WRITES_DISABLED');
});

test('canary allows only configured platforms and bounded writes per runtime', async () => {
  const counter = { count: 0 };
  const runtime = new PursuitRuntime(deps(counter), { liveWritesEnabled: true, canaryPlatforms: ['freelancer'], maxWritesPerRuntime: 1 });
  const first = await runtime.run(action());
  assert.equal(first.status, 'SUBMITTED_VERIFIED');
  assert.equal(counter.count, 1);

  const second = await runtime.run({ ...action(), actionId: 'pursuit-2:submit', idempotencyKey: 'idem-2' });
  assert.equal(second.status, 'NEEDS_HUMAN_AUTH');
  assert.equal(second.reason, 'CANARY_WRITE_LIMIT_REACHED');
  assert.equal(counter.count, 1);
});

test('runtime fails closed before execution when route preflight cannot resolve credentials', async () => {
  const counter = { count: 0 };
  const d = deps(counter);
  d.credentialBroker = new InMemoryCredentialBroker();
  const runtime = new PursuitRuntime(d, { liveWritesEnabled: true, canaryPlatforms: ['freelancer'], maxWritesPerRuntime: 1 });
  const result = await runtime.run(action());
  assert.equal(result.status, 'AUTH_REQUIRED');
  assert.equal(counter.count, 0);
});
