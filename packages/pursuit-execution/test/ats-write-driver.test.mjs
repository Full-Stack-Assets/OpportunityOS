import assert from 'node:assert/strict';
import test from 'node:test';

import { compilePreparedApplication } from '@opportunityos/core';
import { ProviderAtsPlaywrightDriver } from '../src/browser/index.ts';

function prepared() {
  return compilePreparedApplication({
    opportunityId: 'role-1',
    pursuitId: 'pursuit-role-1',
    targetPlatform: 'greenhouse',
    targetUrl: 'https://boards.greenhouse.io/example/jobs/123',
    applicantIdentityRef: 'identity://nic',
    answers: [
      { fieldKey: 'name', prompt: 'Name', answer: 'Nic', confidence: 'HIGH', evidenceClass: 'VERIFIED_FACT', attestationClass: 'ORDINARY' },
      { fieldKey: 'sponsorship', prompt: 'Sponsorship?', answer: 'No', confidence: 'HIGH', evidenceClass: 'USER_ATTESTED_FACT', attestationClass: 'LEGAL' },
    ],
    portfolioRefs: [],
    expectedCost: { requiresPurchase: false },
    requiredUploads: [],
    preparedAt: '2026-08-24T15:00:00Z',
    expiresAt: '2026-08-25T15:00:00Z',
  });
}

function action() {
  return {
    actionId: 'pursuit-role-1:submit',
    approvalRef: 'approval://role-1',
    idempotencyKey: 'idem-role-1',
    application: prepared(),
    route: { executorType: 'browser', platform: 'greenhouse', accountRef: 'acct://greenhouse/nic', sessionRef: 'session://greenhouse/nic' },
    mode: 'LIVE_AUTHORIZED',
  };
}

test('provider ATS driver fills only autofill-authorized answers and requires a provider match', async () => {
  const calls = [];
  const page = { marker: 'page' };
  const provider = {
    id: 'greenhouse',
    matches: (url) => url.includes('greenhouse.io'),
    inspect: async () => ({ fields: [{ fieldKey: 'name', required: true }, { fieldKey: 'sponsorship', required: true, attestationClass: 'LEGAL' }] }),
    detectChallenge: async () => null,
    fill: async (_page, answer) => { calls.push(`fill:${answer.fieldKey}`); },
    upload: async () => { calls.push('upload'); },
    submit: async () => { calls.push('submit'); },
    confirm: async () => ({ externalId: 'application-123', evidenceRefs: ['greenhouse://application/application-123'] }),
  };
  const driver = new ProviderAtsPlaywrightDriver({ open: async () => page, close: async () => calls.push('close') }, [provider]);
  const result = await driver.submitApplication(action());
  assert.deepEqual(calls, ['fill:name', 'submit', 'close']);
  assert.equal(result.outcome, 'SUBMITTED');
  assert.equal(result.externalId, 'application-123');
});

test('provider ATS driver halts on challenge before any fill or submit', async () => {
  let writes = 0;
  const provider = {
    id: 'greenhouse',
    matches: () => true,
    inspect: async () => ({ fields: [{ fieldKey: 'name', required: true }] }),
    detectChallenge: async () => 'CAPTCHA_REQUIRED',
    fill: async () => { writes += 1; },
    upload: async () => { writes += 1; },
    submit: async () => { writes += 1; },
    confirm: async () => undefined,
  };
  const driver = new ProviderAtsPlaywrightDriver({ open: async () => ({}), close: async () => {} }, [provider]);
  const result = await driver.submitApplication(action());
  assert.equal(result.outcome, 'CAPTCHA_REQUIRED');
  assert.equal(writes, 0);
});

test('provider ATS driver fails closed when no provider adapter matches', async () => {
  const driver = new ProviderAtsPlaywrightDriver({ open: async () => ({}), close: async () => {} }, []);
  const result = await driver.submitApplication(action());
  assert.equal(result.outcome, 'FAILED');
  assert.match(result.reason, /PROVIDER/);
});
