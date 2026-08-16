import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function input(overrides = {}) {
  return {
    priority: 'P0_CRITICAL',
    retrievedAt: '2026-08-16T10:00:00Z',
    lastRevalidatedAt: null,
    now: '2026-08-16T12:00:00Z',
    originalContentFingerprint: 'fingerprint-a',
    currentContentFingerprint: 'fingerprint-a',
    sourceStillActive: true,
    revalidationEvidenceRefs: [],
    ...overrides,
  };
}

test('P0-Critical becomes revalidation-due after six hours', () => {
  assert.equal(typeof core.assessOpportunityRevalidation, 'function', 'assessOpportunityRevalidation must be implemented and exported');
  const result = core.assessOpportunityRevalidation(input({now: '2026-08-16T16:00:01Z'}));
  assert.equal(result.state, 'REVALIDATION_DUE');
  assert.equal(result.revalidateAfterMs, 6 * 60 * 60 * 1000);
  assert.equal(result.dueAt, '2026-08-16T16:00:00.000Z');
});

test('evidence-backed revalidation resets the P0-Critical age window', () => {
  const result = core.assessOpportunityRevalidation(input({
    lastRevalidatedAt: '2026-08-16T15:30:00Z',
    now: '2026-08-16T16:00:01Z',
    revalidationEvidenceRefs: ['source:revalidated:1'],
  }));
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.ageMs, 30 * 60 * 1000 + 1000);
  assert.deepEqual(result.evidenceRefs, ['source:revalidated:1']);
});

test('lastRevalidatedAt without evidence cannot reset freshness', () => {
  assert.throws(() => core.assessOpportunityRevalidation(input({
    lastRevalidatedAt: '2026-08-16T15:30:00Z',
    now: '2026-08-16T16:00:01Z',
    revalidationEvidenceRefs: [],
  })), /REVALIDATION_EVIDENCE_REQUIRED/);
});

test('content fingerprint change requires full re-analysis', () => {
  const result = core.assessOpportunityRevalidation(input({
    priority: 'P0',
    now: '2026-08-16T11:00:00Z',
    currentContentFingerprint: 'fingerprint-b',
    revalidationEvidenceRefs: ['source:changed:1'],
  }));
  assert.equal(result.state, 'STALE');
  assert.ok(result.reasons.includes('CONTENT_CHANGED'));
});

test('closed or deleted source invalidates the opportunity', () => {
  const result = core.assessOpportunityRevalidation(input({
    now: '2026-08-16T10:30:00Z',
    sourceStillActive: false,
    revalidationEvidenceRefs: ['source:closed:1'],
  }));
  assert.equal(result.state, 'INVALIDATED');
  assert.ok(result.reasons.includes('SOURCE_INACTIVE'));
});

test('P0, STRONG, and MONITOR use the documented aging windows', () => {
  const p0 = core.assessOpportunityRevalidation(input({priority: 'P0', now: '2026-08-17T10:00:01Z'}));
  const strong = core.assessOpportunityRevalidation(input({priority: 'STRONG', now: '2026-08-19T10:00:01Z'}));
  const monitor = core.assessOpportunityRevalidation(input({priority: 'MONITOR', now: '2026-08-23T10:00:01Z'}));
  assert.equal(p0.state, 'REVALIDATION_DUE');
  assert.equal(strong.state, 'REVALIDATION_DUE');
  assert.equal(monitor.state, 'REVALIDATION_DUE');
});

test('REJECT has no scheduled revalidation window', () => {
  const result = core.assessOpportunityRevalidation(input({priority: 'REJECT', now: '2026-09-16T10:00:00Z'}));
  assert.equal(result.revalidateAfterMs, null);
  assert.equal(result.dueAt, null);
  assert.equal(result.state, 'CURRENT');
});

test('invalid timestamps fail closed', () => {
  assert.throws(() => core.assessOpportunityRevalidation(input({now: 'not-a-date'})), /REVALIDATION_TIMESTAMP_INVALID/);
});
