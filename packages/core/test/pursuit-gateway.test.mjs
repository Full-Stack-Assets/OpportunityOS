import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePreparedApplication } from '../src/pursuit.ts';
import { createApproval } from '../src/trust-kernel.ts';
import { authorizePursuitAction, createIdempotencyKey, createPursuitIntent, decideRetry } from '../src/pursuit-gateway.ts';

function app(proposalText = 'original') {
  return compilePreparedApplication({ opportunityId: 'opp-1', pursuitId: 'p-1', targetPlatform: 'freelancer', targetUrl: 'https://example.test/1', applicantIdentityRef: 'applicant:nicholas', proposalText, answers: [], portfolioRefs: [], expectedCost: { amountMinor: 0, currency: 'USD', credits: 0, requiresPurchase: false }, requiredUploads: [], preparedAt: '2099-01-01T00:00:00Z', expiresAt: '2099-01-02T00:00:00Z' });
}
const route = { executorType: 'official_api', platform: 'freelancer', accountRef: 'freelancer:nicholas' };

test('approval for old payload cannot authorize mutated application', async () => {
  const original = app();
  const approval = createApproval(createPursuitIntent(original, route, 'LIVE_AUTHORIZED'), { approvalId: 'a-1', subject: 'human', expiresAt: '2099-01-02T00:00:00Z', signature: 'signed' });
  const result = await authorizePursuitAction(app('mutated'), approval, route, 'LIVE_AUTHORIZED', '2099-01-01T01:00:00Z', async () => true);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'PAYLOAD_HASH_MISMATCH');
});

test('authorized action binds approval, route, mode, and deterministic idempotency key', async () => {
  const candidate = app();
  const intent = createPursuitIntent(candidate, route, 'LIVE_AUTHORIZED');
  const approval = createApproval(intent, { approvalId: 'a-2', subject: 'human', expiresAt: '2099-01-02T00:00:00Z', signature: 'signed' });
  const result = await authorizePursuitAction(candidate, approval, route, 'LIVE_AUTHORIZED', '2099-01-01T01:00:00Z', async () => true);
  assert.equal(result.authorized, true);
  assert.equal(result.action.approvalRef, 'a-2');
  assert.equal(result.action.mode, 'LIVE_AUTHORIZED');
  assert.equal(result.action.idempotencyKey, createIdempotencyKey(candidate, route.accountRef, 'SUBMIT_PURSUIT'));
});

test('executed-unverified never retries automatically', () => {
  assert.deepEqual(decideRetry('EXECUTED_UNVERIFIED'), { retry: false, reconcile: true });
  assert.deepEqual(decideRetry('FAILED'), { retry: true, reconcile: false });
  assert.deepEqual(decideRetry('SUBMITTED_VERIFIED'), { retry: false, reconcile: false });
});
