import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorReceipt} from '../src/collector-receipts.ts';

function receiptInput(overrides = {}) {
  return {
    collectorId: 'github-issues',
    collectorVersion: '1.0.0',
    provider: 'github_issues',
    queryFamilyId: 'AI_AUTOMATION_REQUEST',
    queryVersion: '1.0.0',
    startedAt: '2026-08-16T16:00:00Z',
    completedAt: '2026-08-16T16:00:01Z',
    retrievalMethod: 'official_api',
    credentialMode: 'anonymous_public',
    healthBefore: 'HEALTHY',
    healthAfter: 'HEALTHY',
    recordsObserved: 2,
    recordsVerified: 1,
    recordsRejected: 1,
    recordsDeduplicated: 0,
    signalsEmitted: 1,
    requestFingerprint: 'request-a',
    resultFingerprint: 'result-a',
    paginationState: null,
    failureCode: null,
    failureDetails: null,
    ...overrides,
  };
}

test('collector receipt hashing is deterministic and excludes no canonical fields', () => {
  const first = createCollectorReceipt(receiptInput());
  const second = createCollectorReceipt(receiptInput());
  assert.equal(first.receiptHash, second.receiptHash);
  assert.equal(first.provider, 'github_issues');
  assert.equal(first.queryFamilyId, 'AI_AUTOMATION_REQUEST');
});

test('receipt hash changes when material discovery evidence changes', () => {
  const first = createCollectorReceipt(receiptInput());
  const countChanged = createCollectorReceipt(receiptInput({signalsEmitted: 2}));
  const queryChanged = createCollectorReceipt(receiptInput({queryFamilyId: 'EXPLICIT_DEVELOPER_HIRE'}));
  const healthChanged = createCollectorReceipt(receiptInput({healthAfter: 'DEGRADED'}));
  assert.notEqual(first.receiptHash, countChanged.receiptHash);
  assert.notEqual(first.receiptHash, queryChanged.receiptHash);
  assert.notEqual(first.receiptHash, healthChanged.receiptHash);
});

test('collector receipts support append-only hash chaining', () => {
  const first = createCollectorReceipt(receiptInput());
  const second = createCollectorReceipt(receiptInput({
    startedAt: '2026-08-16T16:01:00Z',
    completedAt: '2026-08-16T16:01:01Z',
    previousReceiptHash: first.receiptHash,
  }));
  assert.equal(second.previousReceiptHash, first.receiptHash);
  assert.notEqual(second.receiptHash, first.receiptHash);
});

test('collector receipt validation rejects secret-shaped credential modes and invalid counts', () => {
  assert.throws(() => createCollectorReceipt(receiptInput({credentialMode: 'Bearer secret-token'})), /credentialMode/);
  assert.throws(() => createCollectorReceipt(receiptInput({recordsObserved: -1})), /recordsObserved/);
  assert.throws(() => createCollectorReceipt(receiptInput({signalsEmitted: 2, recordsVerified: 1})), /signalsEmitted/);
});

test('serialized collector receipts contain no authorization header or token field', () => {
  const receipt = createCollectorReceipt(receiptInput({credentialMode: 'authenticated'}));
  const serialized = JSON.stringify(receipt).toLowerCase();
  assert.equal(serialized.includes('authorization'), false);
  assert.equal(serialized.includes('bearer'), false);
  assert.equal(serialized.includes('token'), false);
});
