import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExecutorRouter,
  EvidenceBackedPursuitVerifier,
  InMemoryCredentialBroker,
  InMemorySessionBroker,
} from '../src/index.ts';

function action(route) {
  return {
    actionId: 'pursuit-1:submit',
    approvalRef: 'approval-1',
    idempotencyKey: 'idem-1',
    mode: 'LIVE_AUTHORIZED',
    route,
    application: {
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
      payloadHash: 'payload-1',
    },
  };
}

test('executor router prefers official API when both API and browser executors exist', () => {
  const api = { inspect: async () => ({ targetPlatform: 'freelancer', targetUrl: 'x', fields: [], inspectedAt: 'x' }), validate: async () => ({ allowed: true, canExecuteWrite: true, status: 'EXECUTED_UNVERIFIED' }), execute: async () => ({ actionId: 'a', status: 'EXECUTED_UNVERIFIED', executorType: 'official_api', platform: 'freelancer', attemptedAt: 'x' }) };
  const browser = { ...api, execute: async () => ({ actionId: 'a', status: 'EXECUTED_UNVERIFIED', executorType: 'browser', platform: 'freelancer', attemptedAt: 'x' }) };
  const router = new ExecutorRouter([{ platform: 'freelancer', executorType: 'browser', executor: browser }, { platform: 'freelancer', executorType: 'official_api', executor: api }]);
  assert.equal(router.resolve('freelancer')?.executorType, 'official_api');
});

test('router preflight fails closed when API credential or browser session is unavailable', async () => {
  const executor = { inspect: async () => ({ targetPlatform: 'freelancer', targetUrl: 'x', fields: [], inspectedAt: 'x' }), validate: async () => ({ allowed: true, canExecuteWrite: true, status: 'EXECUTED_UNVERIFIED' }), execute: async () => ({ actionId: 'a', status: 'EXECUTED_UNVERIFIED', executorType: 'official_api', platform: 'freelancer', attemptedAt: 'x' }) };
  const router = new ExecutorRouter([{ platform: 'freelancer', executorType: 'official_api', executor }]);
  const credentialBroker = new InMemoryCredentialBroker();
  const sessionBroker = new InMemorySessionBroker();

  const apiResult = await router.preflight(action({ executorType: 'official_api', platform: 'freelancer', accountRef: 'acct://freelancer/nic', credentialRef: 'cred://freelancer/nic' }), credentialBroker, sessionBroker);
  assert.equal(apiResult.ok, false);
  assert.equal(apiResult.status, 'AUTH_REQUIRED');

  const browserAction = action({ executorType: 'browser', platform: 'freelancer', accountRef: 'acct://freelancer/nic', sessionRef: 'session://freelancer/nic' });
  const browserResult = await router.preflight(browserAction, credentialBroker, sessionBroker);
  assert.equal(browserResult.ok, false);
  assert.equal(browserResult.status, 'AUTH_REQUIRED');
});

test('evidence-backed verifier requires independent matching evidence before SUBMITTED_VERIFIED', async () => {
  const verifier = new EvidenceBackedPursuitVerifier(async () => ({
    found: true,
    externalId: 'bid-77',
    evidenceRefs: ['evidence://freelancer/bid-77'],
  }));

  const execution = { actionId: 'pursuit-1:submit', status: 'EXECUTED_UNVERIFIED', executorType: 'official_api', platform: 'freelancer', attemptedAt: '2026-08-24T16:00:00Z', externalId: 'bid-77' };
  const verified = await verifier.verify(action({ executorType: 'official_api', platform: 'freelancer', accountRef: 'acct://freelancer/nic', credentialRef: 'cred://freelancer/nic' }).application, execution);
  assert.equal(verified.verified, true);
  assert.equal(verified.status, 'SUBMITTED_VERIFIED');
  assert.deepEqual(verified.evidenceRefs, ['evidence://freelancer/bid-77']);
});

test('verifier preserves ambiguity and never converts missing evidence into success', async () => {
  const verifier = new EvidenceBackedPursuitVerifier(async () => ({ found: false, evidenceRefs: [] }));
  const execution = { actionId: 'pursuit-1:submit', status: 'EXECUTED_UNVERIFIED', executorType: 'browser', platform: 'freelancer', attemptedAt: '2026-08-24T16:00:00Z' };
  const result = await verifier.verify(action({ executorType: 'browser', platform: 'freelancer', accountRef: 'acct://freelancer/nic', sessionRef: 'session://freelancer/nic' }).application, execution);
  assert.equal(result.verified, false);
  assert.equal(result.status, 'EXECUTED_UNVERIFIED');
});
