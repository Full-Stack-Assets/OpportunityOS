import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function check(overrides = {}) {
  return {
    kind: 'BUYER_LEGITIMACY',
    state: 'PASS',
    statement: 'Buyer identity verified from source evidence.',
    hardDisqualifier: false,
    evidenceRefs: ['eligibility:buyer:1'],
    ...overrides,
  };
}

test('absence of eligibility evidence remains UNKNOWN', () => {
  assert.equal(typeof core.assessCommercialEligibility, 'function', 'assessCommercialEligibility must be implemented and exported');
  const result = core.assessCommercialEligibility([]);
  assert.equal(result.state, 'UNKNOWN');
  assert.ok(result.missingEvidence.length > 0);
});

test('all evidence-backed passing checks produce ELIGIBLE', () => {
  const result = core.assessCommercialEligibility([
    check(),
    check({kind: 'DEADLINE', statement: 'Deadline is still viable.', evidenceRefs: ['eligibility:deadline:1']}),
  ]);
  assert.equal(result.state, 'ELIGIBLE');
  assert.deepEqual(result.hardDisqualifiers, []);
});

test('passing plus unknown checks remain PARTIAL rather than eligible', () => {
  const result = core.assessCommercialEligibility([
    check(),
    check({kind: 'QUALIFICATION', state: 'UNKNOWN', statement: 'Required certification status has not been verified.', evidenceRefs: []}),
  ]);
  assert.equal(result.state, 'PARTIAL');
  assert.ok(result.missingEvidence.some((item) => item.includes('QUALIFICATION')));
});

test('hard evidence-backed qualification failure disqualifies pursuit', () => {
  const result = core.assessCommercialEligibility([
    check({
      kind: 'QUALIFICATION',
      state: 'FAIL',
      statement: 'Required certification is not held.',
      hardDisqualifier: true,
      evidenceRefs: ['rfp:qualification:1'],
    }),
  ]);
  assert.equal(result.state, 'DISQUALIFIED');
  assert.equal(result.hardDisqualifiers.length, 1);
});

test('non-hard failure is PARTIAL and cannot silently become eligible', () => {
  const result = core.assessCommercialEligibility([
    check(),
    check({kind: 'GEOGRAPHY', state: 'FAIL', statement: 'Preferred local presence is not established.', evidenceRefs: ['eligibility:geo:1']}),
  ]);
  assert.equal(result.state, 'PARTIAL');
});

test('PASS or FAIL without evidence is rejected as invalid eligibility input', () => {
  assert.throws(() => core.assessCommercialEligibility([
    check({state: 'PASS', evidenceRefs: []}),
  ]), /ELIGIBILITY_EVIDENCE_REQUIRED/);
});
