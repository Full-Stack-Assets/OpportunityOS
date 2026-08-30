import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePreparedApplication } from '../src/pursuit.ts';
import { answerMayAutoFill, diffLiveForm, evaluateSubmissionPolicy } from '../src/pursuit-policy.ts';

function app(overrides = {}) {
  return compilePreparedApplication({
    opportunityId: 'opp-1', pursuitId: 'p-1', targetPlatform: 'ats', targetUrl: 'https://example.test/job/1',
    applicantIdentityRef: 'applicant:nicholas', answers: [{ fieldKey: 'name', prompt: 'Name', answer: 'Nicholas', sourceOfTruthRef: 'canon:identity', confidence: 'HIGH', evidenceClass: 'VERIFIED_FACT', attestationClass: 'ORDINARY' }],
    portfolioRefs: [], expectedCost: { amountMinor: 0, currency: 'USD', credits: 0, requiresPurchase: false }, requiredUploads: [],
    preparedAt: '2099-01-01T00:00:00Z', expiresAt: '2099-01-02T00:00:00Z', ...overrides,
  });
}

function form(fields = [{ fieldKey: 'name', required: true }], expectedCost = { amountMinor: 0, currency: 'USD', credits: 0, requiresPurchase: false }) {
  return { targetPlatform: 'ats', targetUrl: 'https://example.test/job/1', fields, expectedCost, inspectedAt: '2099-01-01T00:05:00Z' };
}

test('required unresolved legal answer blocks live submission', () => {
  const candidate = app({ answers: [{ fieldKey: 'work_authorization', prompt: 'Authorized?', confidence: 'HIGH', evidenceClass: 'PROHIBITED_TO_INFER', attestationClass: 'LEGAL' }] });
  const result = evaluateSubmissionPolicy(candidate, form([{ fieldKey: 'work_authorization', required: true, attestationClass: 'LEGAL' }]), 'LIVE_AUTHORIZED', '2099-01-01T00:10:00Z');
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'NEEDS_INPUT');
});

test('human-only legal answers are never autofilled even when present', () => {
  assert.equal(answerMayAutoFill({ fieldKey: 'x', prompt: 'x', answer: 'yes', confidence: 'HIGH', evidenceClass: 'USER_ATTESTED_FACT', attestationClass: 'LEGAL' }), false);
});

test('unexpected purchase blocks submission', () => {
  const result = evaluateSubmissionPolicy(app(), form(undefined, { amountMinor: 0, currency: 'USD', credits: 0, requiresPurchase: true }), 'LIVE_AUTHORIZED', '2099-01-01T00:10:00Z');
  assert.equal(result.status, 'COST_CHANGED');
});

test('LIVE_INSPECT never permits a write', () => {
  const result = evaluateSubmissionPolicy(app(), form(), 'LIVE_INSPECT', '2099-01-01T00:10:00Z');
  assert.equal(result.allowed, true);
  assert.equal(result.canExecuteWrite, false);
});

test('new required field is detected without inventing an answer', () => {
  const diff = diffLiveForm(app(), form([{ fieldKey: 'name', required: true }, { fieldKey: 'new_question', required: true }]));
  assert.deepEqual(diff.missingRequiredFieldKeys, ['new_question']);
  const result = evaluateSubmissionPolicy(app(), form([{ fieldKey: 'name', required: true }, { fieldKey: 'new_question', required: true }]), 'LIVE_AUTHORIZED', '2099-01-01T00:10:00Z');
  assert.equal(result.status, 'PAYLOAD_CHANGED');
});

test('expired prepared application blocks submission', () => {
  const result = evaluateSubmissionPolicy(app(), form(), 'LIVE_AUTHORIZED', '2099-01-03T00:00:00Z');
  assert.equal(result.status, 'PAYLOAD_CHANGED');
});
