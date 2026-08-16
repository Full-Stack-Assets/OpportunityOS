import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function fact(statement) {
  return {statement, evidenceRefs: ['source:1']};
}

test('$1.4M budget is preserved as explicit verified budget evidence', () => {
  assert.equal(typeof core.extractObservedEconomicPain, 'function', 'extractObservedEconomicPain must be implemented and exported');
  const result = core.extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('Approved software budget is $1.4M for this procurement.')],
  });
  assert.equal(result.amounts[0].kind, 'EXPLICIT_BUDGET');
  assert.equal(result.amounts[0].maxCents, 140_000_000);
  assert.deepEqual(result.amounts[0].evidenceRefs, ['source:1']);
  assert.equal(result.amounts[0].statement, 'Approved software budget is $1.4M for this procurement.');
  assert.equal(result.amounts[0].observedOnly, true);
});

test('$1.4M recoverable loss is preserved as economic exposure rather than budget', () => {
  const result = core.extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('We have $1.4M of recoverable billing loss caused by the current workflow.')],
  });
  assert.equal(result.amounts.length, 1);
  assert.equal(result.amounts[0].kind, 'RECOVERABLE_LOSS');
  assert.equal(result.amounts[0].maxCents, 140_000_000);
  assert.equal(result.amounts[0].minCents, 140_000_000);
  assert.deepEqual(result.amounts[0].evidenceRefs, ['source:1']);
});

test('ambiguous $1.4M annual impact remains OTHER_EXPOSURE instead of being discarded or promoted to budget', () => {
  const result = core.extractObservedEconomicPain({
    verificationState: 'VERIFIED',
    facts: [fact('The annual impact is $1.4M.')],
  });
  assert.equal(result.amounts.length, 1);
  assert.equal(result.amounts[0].kind, 'OTHER_EXPOSURE');
  assert.equal(result.amounts[0].minCents, 140_000_000);
  assert.equal(result.amounts[0].maxCents, 140_000_000);
});
