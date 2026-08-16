import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function amount(kind, cents) {
  return {
    kind,
    minCents: cents,
    maxCents: cents,
    currency: 'USD',
    statement: `${kind} $${cents / 100}`,
    evidenceRefs: [`economic:${kind.toLowerCase()}:1`],
    confidence: 1,
    observedOnly: true,
  };
}

function policyInput({kind = 'EXPLICIT_BUDGET', cents = 140_000_000, verified = true, reject = false, intent = 0.9, credibility = 0.9, upstream = 'MONITOR'} = {}) {
  const amounts = [amount(kind, cents)];
  return {
    candidate: {
      signal: {id: 'demand:test:1', verificationState: verified ? 'VERIFIED' : 'UNVERIFIED'},
      intent: {kind: 'EXPLICIT_BUYER_REQUEST', score: intent, indicators: []},
      pain: {categories: ['CUSTOM_SOFTWARE'], score: 0.8, observedOnly: true, indicators: []},
      credibility: {credibilityScore: credibility, scamRiskScore: reject ? 0.8 : 0.1, scamFlags: [], reject, reasons: []},
      portfolioMatches: [],
      ranking: {expectedValueScore: 0.5, priority: upstream, escalationReasons: [], components: {}},
      explanations: [],
    },
    pain: {amounts, contradictions: [], evidenceRefs: amounts[0].evidenceRefs},
    value: core.estimateCommercialValue(amounts),
    eligibility: {state: 'ELIGIBLE', checks: [], hardDisqualifiers: [], missingEvidence: [], evidenceRefs: ['eligibility:1']},
  };
}

test('verified $1.4M explicit budget is P0_CRITICAL / BUDGET', () => {
  assert.equal(typeof core.classifyCommercialPriority, 'function', 'classifyCommercialPriority must be implemented and exported');
  const result = core.classifyCommercialPriority(policyInput());
  assert.equal(result.priority, 'P0_CRITICAL');
  assert.equal(result.criticalReason, 'BUDGET');
  assert.equal(result.externalActionAllowed, false);
});

test('verified $1.4M recoverable loss is P0_CRITICAL / RECOVERABLE_LOSS', () => {
  const result = core.classifyCommercialPriority(policyInput({kind: 'RECOVERABLE_LOSS'}));
  assert.equal(result.priority, 'P0_CRITICAL');
  assert.equal(result.criticalReason, 'RECOVERABLE_LOSS');
  assert.equal(result.externalActionAllowed, false);
});

test('hard scam rejection overrides a seven-figure verified amount', () => {
  const result = core.classifyCommercialPriority(policyInput({reject: true}));
  assert.equal(result.priority, 'REJECT');
  assert.equal(result.criticalReason, null);
});

test('unverified seven-figure text cannot become P0-Critical', () => {
  const result = core.classifyCommercialPriority(policyInput({verified: false}));
  assert.equal(result.priority, 'REJECT');
  assert.equal(result.criticalReason, null);
});

test('hard eligibility disqualification overrides seven-figure value', () => {
  const input = policyInput();
  input.eligibility = {
    state: 'DISQUALIFIED', checks: [], hardDisqualifiers: ['REQUIRED_CERTIFICATION_MISSING'],
    missingEvidence: [], evidenceRefs: ['rfp:qualification:1'],
  };
  const result = core.classifyCommercialPriority(input);
  assert.equal(result.priority, 'REJECT');
});

test('weak portfolio fit does not suppress otherwise valid P0-Critical budget', () => {
  const input = policyInput();
  input.candidate.portfolioMatches = [];
  const result = core.classifyCommercialPriority(input);
  assert.equal(result.priority, 'P0_CRITICAL');
});

test('credible verified $150K explicit budget is ordinary P0', () => {
  const result = core.classifyCommercialPriority(policyInput({cents: 15_000_000, intent: 0.8, credibility: 0.8}));
  assert.equal(result.priority, 'P0');
  assert.equal(result.criticalReason, null);
});

test('upstream PRIORITY_0 remains ordinary P0 below critical threshold', () => {
  const result = core.classifyCommercialPriority(policyInput({cents: 5_000_000, upstream: 'PRIORITY_0'}));
  assert.equal(result.priority, 'P0');
});

test('ambiguous seven-figure exposure does not become recoverable-loss criticality', () => {
  const result = core.classifyCommercialPriority(policyInput({kind: 'OTHER_EXPOSURE'}));
  assert.equal(result.priority, 'MONITOR');
  assert.equal(result.criticalReason, null);
});
