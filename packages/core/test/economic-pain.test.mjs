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
