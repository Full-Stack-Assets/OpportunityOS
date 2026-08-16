import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function amount(kind, minCents, maxCents, overrides = {}) {
  return {
    kind,
    minCents,
    maxCents,
    currency: 'USD',
    statement: `${kind} source statement`,
    evidenceRefs: [`economic:${kind.toLowerCase()}:1`],
    confidence: 1,
    observedOnly: true,
    ...overrides,
  };
}

test('fixed contract amount may become exact expected contract value', () => {
  assert.equal(typeof core.estimateCommercialValue, 'function', 'estimateCommercialValue must be implemented and exported');
  const result = core.estimateCommercialValue([
    amount('FIXED_CONTRACT_VALUE', 140_000_000, 140_000_000),
  ]);
  assert.equal(result.contractValue.minCents, 140_000_000);
  assert.equal(result.contractValue.expectedCents, 140_000_000);
  assert.equal(result.contractValue.maxCents, 140_000_000);
  assert.equal(result.contractValue.basis, 'FIXED_CONTRACT');
});

test('verified budget range preserves bounds and uses explicit midpoint assumption', () => {
  const result = core.estimateCommercialValue([
    amount('BUDGET_RANGE', 50_000_000, 140_000_000),
  ]);
  assert.equal(result.contractValue.minCents, 50_000_000);
  assert.equal(result.contractValue.maxCents, 140_000_000);
  assert.equal(result.contractValue.expectedCents, 95_000_000);
  assert.equal(result.contractValue.basis, 'BUDGET_RANGE');
  assert.ok(result.contractValue.assumptions.some((item) => /midpoint/i.test(item)));
});

test('single explicit budget is a ceiling and does not fabricate expected contract value', () => {
  const result = core.estimateCommercialValue([
    amount('EXPLICIT_BUDGET', 140_000_000, 140_000_000),
  ]);
  assert.equal(result.contractValue.expectedCents, null);
  assert.equal(result.contractValue.maxCents, 140_000_000);
  assert.equal(result.contractValue.basis, 'BUDGET_CEILING');
});

test('recoverable loss remains exposure and cannot become contract price', () => {
  const result = core.estimateCommercialValue([
    amount('RECOVERABLE_LOSS', 140_000_000, 140_000_000),
  ]);
  assert.equal(result.contractValue.expectedCents, null);
  assert.equal(result.contractValue.basis, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.observedExposure.length, 1);
  assert.equal(result.observedBudget.length, 0);
});

test('pursuit expected value remains unknown without expected contract value', () => {
  assert.equal(typeof core.calculatePursuitEconomics, 'function', 'calculatePursuitEconomics must be implemented and exported');
  const contractValue = core.estimateCommercialValue([
    amount('EXPLICIT_BUDGET', 140_000_000, 140_000_000),
  ]).contractValue;
  const economics = core.calculatePursuitEconomics({
    contractValue,
    winProbability: 0.4,
    estimatedPursuitCostCents: 50_000,
  });
  assert.equal(economics.expectedGrossPursuitValueCents, null);
  assert.equal(economics.expectedNetPursuitValueCents, null);
});

test('known expected contract value and win probability produce integer-cent pursuit economics', () => {
  const contractValue = core.estimateCommercialValue([
    amount('FIXED_CONTRACT_VALUE', 100_000_000, 100_000_000),
  ]).contractValue;
  const economics = core.calculatePursuitEconomics({
    contractValue,
    winProbability: 0.25,
    estimatedPursuitCostCents: 2_500_000,
  });
  assert.equal(economics.expectedGrossPursuitValueCents, 25_000_000);
  assert.equal(economics.expectedNetPursuitValueCents, 22_500_000);
});

test('invalid probability or pursuit cost is rejected instead of coerced', () => {
  const contractValue = {
    minCents: 100,
    expectedCents: 100,
    maxCents: 100,
    currency: 'USD',
    confidence: 1,
    basis: 'FIXED_CONTRACT',
    evidenceRefs: ['value:1'],
    assumptions: [],
  };
  assert.throws(() => core.calculatePursuitEconomics({contractValue, winProbability: 1.2, estimatedPursuitCostCents: 0}), /WIN_PROBABILITY_INVALID/);
  assert.throws(() => core.calculatePursuitEconomics({contractValue, winProbability: 0.5, estimatedPursuitCostCents: -1}), /PURSUIT_COST_INVALID/);
});
