import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function inputs(overrides = {}) {
  return {
    capabilityEvidence: 0.9,
    eligibility: 0.8,
    buyerIntent: 0.9,
    credibility: 0.8,
    scopeFit: 0.8,
    reuseEfficiency: 0.8,
    freshnessUrgency: 1,
    competitionCloseability: 0.6,
    hardDisqualifiers: [],
    evidenceRefs: ['winability:evidence:1'],
    ...overrides,
  };
}

test('unknown win factors reduce confidence rather than count as zero', () => {
  assert.equal(typeof core.estimateWinProbability, 'function', 'estimateWinProbability must be implemented and exported');
  const result = core.estimateWinProbability(inputs({
    eligibility: null,
    scopeFit: null,
    competitionCloseability: null,
  }));
  assert.ok(result.probability > 0.7);
  assert.ok(result.confidence < 1);
  assert.ok(result.unknownInputs.includes('eligibility'));
  assert.equal(result.calibrationState, 'UNCALIBRATED_V1');
});

test('all known factors produce full model-input confidence', () => {
  const result = core.estimateWinProbability(inputs());
  assert.equal(result.confidence, 1);
  assert.equal(result.unknownInputs.length, 0);
  assert.ok(result.probability > 0 && result.probability <= 1);
});

test('hard eligibility disqualifier forces zero probability', () => {
  const result = core.estimateWinProbability(inputs({
    hardDisqualifiers: ['CERTIFICATION_REQUIRED'],
  }));
  assert.equal(result.probability, 0);
  assert.ok(result.reasons.includes('HARD_DISQUALIFIER'));
});

test('no known factors returns unknown probability with zero confidence', () => {
  const result = core.estimateWinProbability(inputs({
    capabilityEvidence: null,
    eligibility: null,
    buyerIntent: null,
    credibility: null,
    scopeFit: null,
    reuseEfficiency: null,
    freshnessUrgency: null,
    competitionCloseability: null,
  }));
  assert.equal(result.probability, null);
  assert.equal(result.confidence, 0);
});

test('known factors outside zero-to-one range are rejected', () => {
  assert.throws(() => core.estimateWinProbability(inputs({buyerIntent: 1.01})), /WINABILITY_FACTOR_INVALID/);
  assert.throws(() => core.estimateWinProbability(inputs({credibility: -0.1})), /WINABILITY_FACTOR_INVALID/);
});
