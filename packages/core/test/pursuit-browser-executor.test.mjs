import assert from 'node:assert/strict';
import test from 'node:test';

import { GuardedBrowserPursuitExecutor, compilePreparedApplication } from '../src/index.ts';

function application() {
  return compilePreparedApplication({
    opportunityId: 'opp-1',
    pursuitId: 'pursuit-1',
    targetPlatform: 'greenhouse',
    targetUrl: 'https://boards.example/jobs/1',
    applicantIdentityRef: 'identity://nic',
    answers: [{ fieldKey: 'name', prompt: 'Name', answer: 'Nic', confidence: 'HIGH', evidenceClass: 'USER_ATTESTED_FACT', attestationClass: 'ORDINARY' }],
    portfolioRefs: [],
    expectedCost: { requiresPurchase: false },
    requiredUploads: [],
    preparedAt: '2026-08-24T15:00:00Z',
    expiresAt: '2026-08-25T15:00:00Z',
  });
}

function action(mode = 'LIVE_AUTHORIZED') {
  return {
    actionId: 'pursuit-1:submit',
    approvalRef: 'approval-1',
    idempotencyKey: 'idem-1',
    application: application(),
    route: { executorType: 'browser', platform: 'greenhouse', accountRef: 'acct://greenhouse/nic', sessionRef: 'session://greenhouse/nic' },
    mode,
  };
}

test('browser executor inspects live form and reuses submission policy before writes', async () => {
  let submits = 0;
  const driver = {
    inspectForm: async () => ({ formId: 'job-1', fields: [{ fieldKey: 'name', required: true }], expectedCost: { requiresPurchase: false } }),
    submitApplication: async () => { submits += 1; return { outcome: 'SUBMITTED', externalId: 'app-1', evidenceRefs: ['browser://confirmation/1'] }; },
  };
  const executor = new GuardedBrowserPursuitExecutor(driver, () => '2026-08-24T16:00:00Z');
  const form = await executor.inspect({ platform: 'greenhouse', url: 'https://boards.example/jobs/1', opportunityId: 'opp-1', accountRef: 'acct://greenhouse/nic' });
  const validation = await executor.validate(application(), form);
  assert.equal(validation.allowed, true);
  assert.equal(validation.canExecuteWrite, true);

  const result = await executor.execute(action());
  assert.equal(submits, 1);
  assert.equal(result.status, 'EXECUTED_UNVERIFIED');
  assert.equal(result.externalId, 'app-1');
});

test('browser executor never writes in simulation or live-inspect modes', async () => {
  let submits = 0;
  const driver = {
    inspectForm: async () => ({ fields: [] }),
    submitApplication: async () => { submits += 1; return { outcome: 'SUBMITTED' }; },
  };
  const executor = new GuardedBrowserPursuitExecutor(driver, () => '2026-08-24T16:00:00Z');
  const result = await executor.execute(action('LIVE_INSPECT'));
  assert.equal(submits, 0);
  assert.equal(result.status, 'EXECUTED_UNVERIFIED');
  assert.match(result.reason, /NON_WRITING/);
});

test('browser executor maps auth, MFA, CAPTCHA, expiry, and duplicate outcomes without retrying writes', async () => {
  const outcomes = [
    ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
    ['MFA_REQUIRED', 'MFA_REQUIRED'],
    ['CAPTCHA_REQUIRED', 'CAPTCHA_REQUIRED'],
    ['SESSION_EXPIRED', 'SESSION_EXPIRED'],
    ['ALREADY_SUBMITTED', 'ALREADY_SUBMITTED'],
  ];

  for (const [outcome, status] of outcomes) {
    const executor = new GuardedBrowserPursuitExecutor({
      inspectForm: async () => ({ fields: [] }),
      submitApplication: async () => ({ outcome, externalId: outcome === 'ALREADY_SUBMITTED' ? 'existing-1' : undefined }),
    }, () => '2026-08-24T16:00:00Z');
    const result = await executor.execute(action());
    assert.equal(result.status, status);
  }
});
