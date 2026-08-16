import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCollectorRunFailure} from '../src/contracts.ts';

test('collector failures are fail-closed and carry explicit health state', () => {
  const result = createCollectorRunFailure({
    provider: 'github_issues',
    state: 'RATE_LIMITED',
    checkedAt: '2026-08-16T16:00:00Z',
    detail: 'GitHub rate limit prevented verified retrieval.',
    familyId: 'AI_AUTOMATION_REQUEST',
    queryVersion: '1.0.0',
    collectorId: 'github-issues',
    collectorVersion: '1.0.0',
  });
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.health.state, 'RATE_LIMITED');
  assert.equal(result.receipt.signalsEmitted, 0);
  assert.equal(result.receipt.recordsVerified, 0);
});

test('collector failure result cannot contain secret-bearing authorization fields', () => {
  const source = readFileSync(new URL('../src/contracts.ts', import.meta.url), 'utf8').toLowerCase();
  assert.equal(source.includes('authorization: bearer'), false);
  assert.equal(source.includes('access_token'), false);
  assert.equal(source.includes('refresh_token'), false);
});
