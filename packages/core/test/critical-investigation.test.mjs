import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function candidate({id = 'demand:test:budget', factStatement = 'Approved software procurement budget is $1.4M.', retrievedAt = '2026-08-16T15:00:00Z', contentFingerprint = 'fingerprint-a'} = {}) {
  return {
    signal: {
      id,
      sourceType: 'PUBLIC_DEMAND',
      sourceProvider: 'github_issues',
      canonicalUrl: 'https://github.com/example/project/issues/1',
      externalId: '1',
      observedAt: retrievedAt,
      retrievedAt,
      retrievalMethod: 'official_api',
      contentFingerprint,
      facts: [{statement: factStatement, evidenceRefs: ['source:fact:1']}],
      freshnessState: 'FRESH',
      verificationState: 'VERIFIED',
      sourcePermissions: {public: true},
      rawSourceRef: 'source:raw:1',
      provenanceRefs: ['source:provenance:1'],
    },
    intent: {kind: 'EXPLICIT_BUYER_REQUEST', score: 0.92, indicators: ['need']},
    pain: {categories: ['CUSTOM_SOFTWARE'], score: 0.8, observedOnly: true, indicators: ['workflow']},
    credibility: {credibilityScore: 0.9, scamRiskScore: 0.05, scamFlags: [], reject: false, reasons: []},
    portfolioMatches: [{artifactId: 'artifact:opportunityos', title: 'OpportunityOS', score: 0.88, matchedSkills: ['automation'], evidenceRefs: ['portfolio:1']}],
    ranking: {expectedValueScore: 0.9, priority: 'PRIORITY_0', escalationReasons: [], components: {}},
    explanations: [],
  };
}

function preflight(overrides = {}) {
  return {
    requestId: 'bg-request-1',
    decision: 'EXTEND_EXISTING',
    justification: 'verified reuse candidate',
    primaryProjectId: 'project:opportunityos',
    candidates: [],
    reusePlan: {reuse: [], extend: ['project:opportunityos'], create: []},
    wasteRisk: {score: 0.1, estimatedRecreationPercent: 10, factors: []},
    evidence: {projectIds: ['project:opportunityos'], constraintIds: [], decisionIds: []},
    generatedAt: '2026-08-16T15:00:00Z',
    payloadHash: 'payload-hash-1',
    ...overrides,
  };
}

function buildGraphEvidence() {
  return {
    preflight: preflight(),
    items: [{
      id: 'project:opportunityos',
      kind: 'PROJECT',
      title: 'OpportunityOS',
      description: 'software procurement workflow automation and opportunity intelligence',
      tags: ['software', 'procurement', 'workflow', 'automation'],
      verified: true,
      evidenceRefs: ['buildgraph:project:opportunityos'],
    }],
  };
}

function eligibilityChecks() {
  return [
    {
      kind: 'BUYER_LEGITIMACY', state: 'PASS', statement: 'Buyer/source identity evidence is credible.',
      hardDisqualifier: false, evidenceRefs: ['eligibility:buyer:1'],
    },
    {
      kind: 'CAPABILITY_PROOF', state: 'PASS', statement: 'Verified BuildGraph delivery evidence exists.',
      hardDisqualifier: false, evidenceRefs: ['eligibility:capability:1'],
    },
  ];
}

function investigationInput(overrides = {}) {
  return {
    candidate: candidate(),
    buildGraphEvidence: buildGraphEvidence(),
    eligibilityChecks: eligibilityChecks(),
    estimatedPursuitCostCents: 250_000,
    now: '2026-08-16T16:00:00Z',
    lastRevalidatedAt: null,
    currentContentFingerprint: 'fingerprint-a',
    sourceStillActive: true,
    revalidationEvidenceRefs: [],
    resolvedInvestigationTasks: [],
    ...overrides,
  };
}

test('verified $1.4M software procurement budget becomes P0-Critical investigation without inventing expected contract value', () => {
  assert.equal(typeof core.buildCommercialInvestigation, 'function', 'buildCommercialInvestigation must be implemented and exported');
  const packet = core.buildCommercialInvestigation(investigationInput());
  assert.equal(packet.priority, 'P0_CRITICAL');
  assert.equal(packet.criticalReason, 'BUDGET');
  assert.equal(packet.commercialValue.contractValue.maxCents, 140_000_000);
  assert.equal(packet.commercialValue.contractValue.expectedCents, null);
  assert.equal(packet.externalActionAllowed, false);
  assert.equal(packet.revalidation.state, 'CURRENT');
  assert.ok(packet.factVsInference.some((item) => item.kind === 'FACT' && item.statement.includes('$1.4M')));
  assert.ok(packet.factVsInference.some((item) => item.kind === 'INFERENCE' && item.statement.includes('P0_CRITICAL')));
});

test('verified $1.4M recoverable loss is P0-Critical while contract value and pursuit EV remain unknown', () => {
  const lossCandidate = candidate({
    id: 'demand:test:loss',
    factStatement: 'The current workflow has $1.4M of explicitly recoverable billing loss.',
  });
  const packet = core.buildCommercialInvestigation(investigationInput({candidate: lossCandidate}));
  assert.equal(packet.priority, 'P0_CRITICAL');
  assert.equal(packet.criticalReason, 'RECOVERABLE_LOSS');
  assert.equal(packet.commercialValue.contractValue.expectedCents, null);
  assert.equal(packet.pursuitEconomics.expectedGrossPursuitValueCents, null);
  assert.equal(packet.pursuitEconomics.expectedNetPursuitValueCents, null);
});

test('stale P0-Critical opportunity keeps criticality but is blocked from review readiness', () => {
  const packet = core.buildCommercialInvestigation(investigationInput({
    now: '2026-08-16T22:00:01Z',
  }));
  assert.equal(packet.priority, 'P0_CRITICAL');
  assert.equal(packet.revalidation.state, 'REVALIDATION_DUE');
  assert.equal(packet.approvalReadiness, 'NOT_READY');
  assert.ok(packet.proofTasks.some((task) => task.kind === 'REVALIDATE_SOURCE' && task.required));
});

test('missing BuildGraph proof does not suppress criticality but requires capability proof', () => {
  const packet = core.buildCommercialInvestigation(investigationInput({buildGraphEvidence: null}));
  assert.equal(packet.priority, 'P0_CRITICAL');
  assert.equal(packet.buildGraphMatch.state, 'EVIDENCE_GAP');
  assert.equal(packet.approvalReadiness, 'NOT_READY');
  assert.ok(packet.proofTasks.some((task) => task.kind === 'PROVE_CAPABILITY' && task.required));
});

test('evidence-backed resolution of all deterministic required tasks can reach human-review readiness without external authority', () => {
  const falsifyId = 'investigation:demand:test:budget:falsify_opportunity';
  const packet = core.buildCommercialInvestigation(investigationInput({
    resolvedInvestigationTasks: [{id: falsifyId, evidenceRefs: ['investigation:falsification:1']}],
  }));
  assert.equal(packet.approvalReadiness, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(packet.externalActionAllowed, false);
  const falsifyTask = packet.proofTasks.find((task) => task.id === falsifyId);
  assert.equal(falsifyTask?.required, false);
  assert.ok(falsifyTask?.evidenceRefs.includes('investigation:falsification:1'));
});

test('bare task resolution without evidence cannot unlock readiness', () => {
  const falsifyId = 'investigation:demand:test:budget:falsify_opportunity';
  const packet = core.buildCommercialInvestigation(investigationInput({
    resolvedInvestigationTasks: [{id: falsifyId, evidenceRefs: []}],
  }));
  assert.equal(packet.approvalReadiness, 'NOT_READY');
  assert.ok(packet.missingEvidence.includes(`RESOLUTION_EVIDENCE_MISSING:${falsifyId}`));
  assert.ok(packet.proofTasks.some((task) => task.id === falsifyId && task.required));
});

test('unknown eligibility creates an explicit verification task', () => {
  const packet = core.buildCommercialInvestigation(investigationInput({eligibilityChecks: []}));
  assert.equal(packet.eligibility.state, 'UNKNOWN');
  assert.equal(packet.approvalReadiness, 'NOT_READY');
  assert.ok(packet.proofTasks.some((task) => task.kind === 'VERIFY_ELIGIBILITY' && task.required));
});
