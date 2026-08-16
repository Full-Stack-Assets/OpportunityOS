import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACQUISITION_SCORE_POLICY_V1,
  applyWarmSignalPriority,
  deduplicateDemandSignals,
  isDemandSignalActive,
  preparePursuitActionIntent,
  scoreAcquisitionOpportunity,
  transitionPursuit,
  validateCommercialHypothesis,
  validatePursuitPacket,
} from '../src/acquisition.ts';
import {createApproval} from '../src/trust-kernel.ts';

function signal(overrides = {}) {
  return {
    id: 'signal-1',
    sourceType: 'BUYER_INTENT',
    sourceProvider: 'freelancer',
    canonicalUrl: 'https://example.com/jobs/1',
    externalId: '1',
    observedAt: '2026-08-16T12:00:00Z',
    retrievedAt: '2026-08-16T12:01:00Z',
    retrievalMethod: 'official_api',
    contentFingerprint: 'fp-1',
    facts: [{statement: 'Buyer requests an automation build', evidenceRefs: ['source:1']}],
    freshnessState: 'FRESH',
    verificationState: 'VERIFIED',
    sourcePermissions: {read: true, contact: 'PROVIDER_NATIVE_CONFIRMATION'},
    rawSourceRef: 'source:1',
    provenanceRefs: ['source:1'],
    ...overrides,
  };
}

function hypothesis(overrides = {}) {
  return {
    whyThisAccount: 'Explicit request matches verified automation capability.',
    whyNow: 'The buyer posted a current paid request.',
    observedProblemEvidence: ['source:1'],
    hypothesizedImprovement: 'Reduce manual work with a bounded automation.',
    factVsInference: [
      {kind: 'FACT', statement: 'The buyer posted a paid automation request.', evidenceRefs: ['source:1']},
      {kind: 'INFERENCE', statement: 'A workflow audit may reveal additional savings.', evidenceRefs: []},
    ],
    estimatedValue: {amountCents: null, currency: null, confidence: 0.3, assumptions: ['Budget not observed']},
    candidateCapabilityIds: ['capability:automation'],
    candidateArtifactIds: [],
    showBeforeAsk: 'Provide a bounded workflow map.',
    invalidationCriteria: ['Request closes before pursuit'],
    missingEvidence: ['Exact budget'],
    ...overrides,
  };
}

function packet(overrides = {}) {
  return {
    id: 'pursuit-1',
    opportunityId: 'opportunity-1',
    prospectAccountId: 'account-1',
    state: 'PREPARED',
    selectedOffer: 'Workflow audit and automation prototype',
    targetContact: null,
    contactChannel: 'freelancer',
    evidenceRefs: ['source:1'],
    capabilityMatch: {state: 'EVIDENCE_MATCHED', evidenceRefs: ['artifact:1'], proofStep: null},
    proposedPayload: {message: 'I can show a bounded proof before proposing a larger build.'},
    proposedActionType: 'EXTERNAL_APPLICATION',
    expectedValue: {amountCents: null, currency: null, confidence: 0.3},
    estimatedPursuitCost: {amountCents: 0, currency: 'USD'},
    nextAction: 'Request approval for provider-native application.',
    nextActionDeadline: null,
    approvalState: 'NOT_REQUESTED',
    actionEnvelopeHash: null,
    outcomeState: 'NONE',
    outcomeEvidenceRefs: [],
    ...overrides,
  };
}

test('active demand requires fresh and verified source evidence', () => {
  assert.equal(isDemandSignalActive(signal()), true);
  assert.equal(isDemandSignalActive(signal({freshnessState: 'STALE'})), false);
  assert.equal(isDemandSignalActive(signal({freshnessState: 'REVALIDATION_REQUIRED'})), false);
  assert.equal(isDemandSignalActive(signal({verificationState: 'UNVERIFIED'})), false);
});

test('commercial facts require evidence and remain distinct from inference', () => {
  assert.doesNotThrow(() => validateCommercialHypothesis(hypothesis()));
  assert.throws(
    () => validateCommercialHypothesis(hypothesis({factVsInference: [{kind: 'FACT', statement: 'Internal conversion is poor.', evidenceRefs: []}]})),
    /FACT_EVIDENCE_REQUIRED/,
  );
});

test('pursuit state transitions cannot skip the approval boundary', () => {
  assert.equal(transitionPursuit('SHORTLISTED', 'PREPARED'), 'PREPARED');
  assert.equal(transitionPursuit('PREPARED', 'APPROVAL_REQUIRED'), 'APPROVAL_REQUIRED');
  assert.throws(() => transitionPursuit('PREPARED', 'PURSUED'), /INVALID_PURSUIT_TRANSITION/);
});

test('acquisition scoring is deterministic, versioned, and keeps unknown distinct from zero', () => {
  assert.equal(ACQUISITION_SCORE_POLICY_V1.version, 'acquisition-score-v1');
  const explicit = scoreAcquisitionOpportunity({
    buyerIntentStrength: 1,
    evidenceMatch: 0.9,
    contactability: 0.8,
    commercialValue: null,
    freshnessUrgency: 1,
    reuseEfficiency: 0.8,
    strategicCompounding: 0.5,
    riskPenalty: 0.1,
    evidenceRefs: ['source:1', 'artifact:1'],
    hardDisqualifiers: [],
  });
  const generic = scoreAcquisitionOpportunity({
    buyerIntentStrength: 0.2,
    evidenceMatch: 0.9,
    contactability: 0.8,
    commercialValue: null,
    freshnessUrgency: 0.5,
    reuseEfficiency: 0.8,
    strategicCompounding: 0.5,
    riskPenalty: 0.1,
    evidenceRefs: ['source:2', 'artifact:1'],
    hardDisqualifiers: [],
  });
  assert.ok(explicit.finalScore > generic.finalScore);
  assert.deepEqual(explicit.unknownInputs, ['commercialValue']);
  assert.equal(explicit.rawInputs.commercialValue, null);
  assert.equal(scoreAcquisitionOpportunity({...explicit.rawInputs, evidenceRefs: [], hardDisqualifiers: ['STALE_OR_CLOSED']}).decision, 'REJECT');
});

test('exact source/content duplicates are linked without deleting source history', () => {
  const duplicate = signal({id: 'signal-2', observedAt: '2026-08-16T12:05:00Z'});
  const distinct = signal({id: 'signal-3', canonicalUrl: 'https://example.com/jobs/2', externalId: '2', contentFingerprint: 'fp-2'});
  const result = deduplicateDemandSignals([duplicate, distinct, signal()]);
  assert.deepEqual(result.unique.map((item) => item.id), ['signal-1', 'signal-3']);
  assert.deepEqual(result.duplicates, [{duplicateId: 'signal-2', canonicalId: 'signal-1', reason: 'SOURCE_CONTENT_IDENTITY'}]);
});

test('evidence gaps require a bounded proof step before a pursuit packet is valid', () => {
  assert.throws(
    () => validatePursuitPacket(packet({capabilityMatch: {state: 'EVIDENCE_GAP', evidenceRefs: [], proofStep: null}})),
    /EVIDENCE_GAP_PROOF_STEP_REQUIRED/,
  );
  assert.doesNotThrow(() => validatePursuitPacket(packet({capabilityMatch: {state: 'EVIDENCE_GAP', evidenceRefs: [], proofStep: 'Build a bounded proof-of-capability artifact.'}})));
});

test('warm direct-client replies preempt cold sourcing deterministically', () => {
  const ordered = applyWarmSignalPriority([
    {id: 'cold-high', signalType: 'COLD_SOURCE', basePriority: 100},
    {id: 'warm', signalType: 'DIRECT_CLIENT_REPLY', basePriority: 1},
    {id: 'cold-low', signalType: 'COLD_SOURCE', basePriority: 5},
  ]);
  assert.deepEqual(ordered.map((item) => item.id), ['warm', 'cold-high', 'cold-low']);
});

test('consequential pursuit payload changes invalidate an existing approval hash', () => {
  const intent = preparePursuitActionIntent(packet());
  const approval = createApproval(intent, {
    approvalId: 'approval-1',
    subject: 'operator',
    expiresAt: '2026-08-17T12:00:00Z',
    signature: 'test-signature',
  });
  const changedIntent = preparePursuitActionIntent(packet({proposedPayload: {message: 'Changed payload'}}));
  const changedApproval = createApproval(changedIntent, {
    approvalId: 'approval-2',
    subject: 'operator',
    expiresAt: '2026-08-17T12:00:00Z',
    signature: 'test-signature',
  });
  assert.notEqual(approval.payloadHash, changedApproval.payloadHash);
});
