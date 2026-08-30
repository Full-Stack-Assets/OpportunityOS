import assert from 'node:assert/strict';
import test from 'node:test';

import { compilePreparedApplication } from '@opportunityos/core';
import { AtsBrowserEvidenceVerifier } from '../src/browser/index.ts';

function application() {
  return compilePreparedApplication({
    opportunityId: 'role-1',
    pursuitId: 'pursuit-role-1',
    targetPlatform: 'greenhouse',
    targetUrl: 'https://boards.greenhouse.io/example/jobs/123',
    applicantIdentityRef: 'identity://nic',
    answers: [],
    portfolioRefs: [],
    expectedCost: { requiresPurchase: false },
    requiredUploads: [],
    preparedAt: '2026-08-24T15:00:00Z',
    expiresAt: '2026-08-25T15:00:00Z',
  });
}

test('ATS verifier reopens durable confirmation evidence and requires exact external id match', async () => {
  const opened = [];
  const sessions = {
    open: async (url) => { opened.push(url); return {}; },
    close: async () => {},
  };
  const provider = {
    id: 'greenhouse',
    matches: (url) => url.includes('greenhouse.io'),
    inspect: async () => ({ fields: [] }),
    detectChallenge: async () => null,
    fill: async () => {}, upload: async () => {}, submit: async () => {},
    confirm: async () => ({ externalId: 'app-123', evidenceRefs: ['greenhouse://application/app-123'] }),
  };
  const verifier = new AtsBrowserEvidenceVerifier(sessions, [provider], 'session://greenhouse/nic', () => '2026-08-24T16:10:00Z');
  const result = await verifier.verify(application(), {
    actionId: 'action-1', status: 'EXECUTED_UNVERIFIED', executorType: 'browser', platform: 'greenhouse', attemptedAt: '2026-08-24T16:00:00Z', externalId: 'app-123', evidenceRefs: ['https://boards.greenhouse.io/applications/app-123'],
  });
  assert.equal(result.verified, true);
  assert.equal(result.status, 'SUBMITTED_VERIFIED');
  assert.deepEqual(opened, ['https://boards.greenhouse.io/applications/app-123']);
});

test('ATS verifier preserves ambiguity when durable URL or exact id is absent', async () => {
  let opens = 0;
  const verifier = new AtsBrowserEvidenceVerifier({ open: async () => { opens += 1; return {}; }, close: async () => {} }, [], 'session://x');
  const result = await verifier.verify(application(), {
    actionId: 'action-2', status: 'EXECUTED_UNVERIFIED', executorType: 'browser', platform: 'greenhouse', attemptedAt: '2026-08-24T16:00:00Z', externalId: 'app-123', evidenceRefs: ['greenhouse://application/app-123'],
  });
  assert.equal(result.verified, false);
  assert.equal(result.status, 'EXECUTED_UNVERIFIED');
  assert.equal(opens, 0);
});
