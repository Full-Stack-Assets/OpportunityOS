import assert from 'node:assert/strict';
import test from 'node:test';

import { compilePreparedApplication } from '@opportunityos/core';
import { FreelancerTrustedGatewayExecutor } from '../src/freelancer-trusted-gateway.ts';

function prepared(overrides = {}) {
  return compilePreparedApplication({
    opportunityId: '123',
    pursuitId: 'pursuit-123',
    targetPlatform: 'freelancer',
    targetUrl: 'https://www.freelancer.com/projects/123',
    applicantIdentityRef: 'identity://nic',
    proposalText: 'I can deliver this safely.',
    answers: [
      { fieldKey: 'freelancer_bidder_id', prompt: 'Bidder ID', answer: 456, confidence: 'HIGH', evidenceClass: 'VERIFIED_FACT', attestationClass: 'ORDINARY' },
      { fieldKey: 'freelancer_bid_amount', prompt: 'Bid amount', answer: 100, confidence: 'HIGH', evidenceClass: 'USER_ATTESTED_FACT', attestationClass: 'COMPENSATION' },
      { fieldKey: 'freelancer_bid_period_days', prompt: 'Period', answer: 7, confidence: 'HIGH', evidenceClass: 'USER_ATTESTED_FACT', attestationClass: 'AVAILABILITY' },
      { fieldKey: 'freelancer_milestone_percentage', prompt: 'Milestone', answer: 100, confidence: 'HIGH', evidenceClass: 'USER_ATTESTED_FACT', attestationClass: 'COMPENSATION' },
    ],
    portfolioRefs: [],
    expectedCost: { requiresPurchase: false },
    requiredUploads: [],
    preparedAt: '2026-08-24T15:00:00Z',
    expiresAt: '2026-08-25T15:00:00Z',
    ...overrides,
  });
}

function action(application = prepared()) {
  return {
    actionId: 'pursuit-123:submit',
    approvalRef: 'approval://123',
    idempotencyKey: 'idem-123',
    application,
    route: { executorType: 'official_api', platform: 'freelancer', accountRef: 'acct://freelancer/nic', credentialRef: 'cred://freelancer/nic' },
    mode: 'LIVE_AUTHORIZED',
  };
}

test('trusted bridge derives bid payload only from the authorized prepared application', async () => {
  let envelope;
  const executor = new FreelancerTrustedGatewayExecutor(async (input) => {
    envelope = input;
    return { status: 'executed_unverified', external_id: '789', verified: false };
  }, () => '2026-08-24T16:00:00Z');

  const result = await executor.execute(action());
  assert.equal(result.status, 'EXECUTED_UNVERIFIED');
  assert.equal(result.externalId, '789');
  assert.deepEqual(envelope, {
    operation: 'submit_bid',
    approval_ref: 'approval://123',
    idempotency_key: 'idem-123',
    project_id: 123,
    bidder_id: 456,
    amount: 100,
    period: 7,
    milestone_percentage: 100,
    description: 'I can deliver this safely.',
  });
});

test('trusted bridge fails closed when required bid facts are absent or ungrounded', async () => {
  let calls = 0;
  const executor = new FreelancerTrustedGatewayExecutor(async () => { calls += 1; return { status: 'executed_unverified' }; });
  const app = prepared({ answers: [] });
  const result = await executor.execute(action(app));
  assert.equal(result.status, 'NEEDS_INPUT');
  assert.equal(calls, 0);
});

test('trusted bridge cannot execute a browser route, different platform, or non-live mode', async () => {
  let calls = 0;
  const executor = new FreelancerTrustedGatewayExecutor(async () => { calls += 1; return { status: 'executed_unverified' }; });

  const browser = await executor.execute({ ...action(), route: { executorType: 'browser', platform: 'freelancer', accountRef: 'acct://freelancer/nic' } });
  assert.equal(browser.status, 'UNAVAILABLE');

  const inspect = await executor.execute({ ...action(), mode: 'LIVE_INSPECT' });
  assert.equal(inspect.status, 'NEEDS_HUMAN_AUTH');

  const other = prepared({ targetPlatform: 'contra' });
  const mismatch = await executor.execute(action(other));
  assert.equal(mismatch.status, 'ACCOUNT_MISMATCH');
  assert.equal(calls, 0);
});

test('trusted bridge preserves ambiguous write outcomes and maps verification separately', async () => {
  const executor = new FreelancerTrustedGatewayExecutor(async (input) => {
    if (input.operation === 'submit_bid') return { status: 'executed_unverified', external_id: '789', verified: false };
    return { status: 'submitted_verified', external_id: '789', verified: true, evidence_refs: ['freelancer-api://bid/789'] };
  }, () => '2026-08-24T16:00:00Z');

  const execution = await executor.execute(action());
  const verification = await executor.verify(prepared(), execution);
  assert.equal(verification.verified, true);
  assert.equal(verification.status, 'SUBMITTED_VERIFIED');
  assert.deepEqual(verification.evidenceRefs, ['freelancer-api://bid/789']);
});
