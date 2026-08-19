import {
  buildCommercialInvestigation,
  createApproval,
  createSimulationIntent,
  runSimulationWorkOrder,
} from '../packages/core/src/index.ts';

const now = '2026-08-16T16:00:00Z';

const smokeInput = {
  workOrderId: 'buyer-demo-work-order',
  preflight: {
    requestId: 'buyer-demo-preflight',
    decision: 'CREATE_NEW' as const,
    justification: 'Buyer demo uses a fixture BuildGraph CREATE_NEW result. This is not a live preflight.',
    candidates: [],
    reusePlan: { reuse: [], extend: [], create: ['buyer-demo-artifact'] },
    wasteRisk: { score: 0, estimatedRecreationPercent: 0, factors: [] },
    evidence: { projectIds: [], constraintIds: [], decisionIds: [] },
    generatedAt: '2026-08-16T15:00:00.000Z',
    payloadHash: 'buyer-demo-preflight-fixture',
  },
  requirements: [{ id: 'demo', description: 'Create a simulation-only buyer-demo artifact', dependsOn: [] }],
  factory: 'SOFTWARE_WEB' as const,
  now: '2026-08-16T15:00:00.000Z',
};

const approval = createApproval(createSimulationIntent(smokeInput), {
  approvalId: 'buyer-demo-approval',
  subject: 'buyer-demo-verifier',
  expiresAt: '2026-08-16T20:00:00.000Z',
  signature: 'buyer-demo-signature-fixture',
});

const simulation = await runSimulationWorkOrder({
  ...smokeInput,
  approval,
  verifySignature: async () => true,
});

if (
  simulation.workOrder.state !== 'COMPLETED'
  || !simulation.verification.verified
  || simulation.externalSideEffects !== 0
  || simulation.executionMode !== 'SIMULATION'
) {
  throw new Error('OpportunityOS buyer demo failed simulation invariants');
}

const packet = buildCommercialInvestigation({
  candidate: {
    signal: {
      id: 'demand:buyer-demo:budget',
      sourceType: 'PUBLIC_DEMAND',
      sourceProvider: 'github_issues',
      canonicalUrl: 'https://github.com/example/project/issues/1',
      externalId: '1',
      observedAt: now,
      retrievedAt: now,
      retrievalMethod: 'official_api',
      contentFingerprint: 'buyer-demo-fingerprint',
      facts: [{
        statement: 'Approved software procurement budget is $1.4M.',
        evidenceRefs: ['source:fact:1'],
      }],
      freshnessState: 'FRESH',
      verificationState: 'VERIFIED',
      sourcePermissions: { public: true },
      rawSourceRef: 'source:raw:1',
      provenanceRefs: ['source:provenance:1'],
    },
    intent: { kind: 'EXPLICIT_BUYER_REQUEST', score: 0.92, indicators: ['need'] },
    pain: { categories: ['CUSTOM_SOFTWARE'], score: 0.8, observedOnly: true, indicators: ['workflow'] },
    credibility: { credibilityScore: 0.9, scamRiskScore: 0.05, scamFlags: [], reject: false, reasons: [] },
    portfolioMatches: [{
      artifactId: 'artifact:opportunityos',
      title: 'OpportunityOS',
      score: 0.88,
      matchedSkills: ['automation'],
      evidenceRefs: ['portfolio:1'],
    }],
    ranking: { expectedValueScore: 0.9, priority: 'PRIORITY_0', escalationReasons: [], components: {} },
    explanations: [],
  },
  buildGraphEvidence: {
    preflight: {
      requestId: 'bg-request-1',
      decision: 'EXTEND_EXISTING',
      justification: 'verified reuse candidate',
      primaryProjectId: 'project:opportunityos',
      candidates: [],
      reusePlan: { reuse: [], extend: ['project:opportunityos'], create: [] },
      wasteRisk: { score: 0.1, estimatedRecreationPercent: 10, factors: [] },
      evidence: { projectIds: ['project:opportunityos'], constraintIds: [], decisionIds: [] },
      generatedAt: now,
      payloadHash: 'payload-hash-1',
    },
    items: [{
      id: 'project:opportunityos',
      kind: 'PROJECT',
      title: 'OpportunityOS',
      description: 'software procurement workflow automation and opportunity intelligence',
      tags: ['software', 'procurement', 'workflow', 'automation'],
      verified: true,
      evidenceRefs: ['buildgraph:project:opportunityos'],
    }],
  },
  eligibilityChecks: [
    {
      kind: 'BUYER_LEGITIMACY',
      state: 'PASS',
      statement: 'Buyer/source identity evidence is credible.',
      hardDisqualifier: false,
      evidenceRefs: ['eligibility:buyer:1'],
    },
    {
      kind: 'CAPABILITY_PROOF',
      state: 'PASS',
      statement: 'Verified BuildGraph delivery evidence exists.',
      hardDisqualifier: false,
      evidenceRefs: ['eligibility:capability:1'],
    },
  ],
  estimatedPursuitCostCents: 250_000,
  now,
  lastRevalidatedAt: null,
  currentContentFingerprint: 'buyer-demo-fingerprint',
  sourceStillActive: true,
  revalidationEvidenceRefs: [],
  resolvedInvestigationTasks: [{
    id: 'investigation:demand:buyer-demo:budget:falsify_opportunity',
    evidenceRefs: ['investigation:falsification:1'],
  }],
});

if (packet.externalActionAllowed !== false) {
  throw new Error('OpportunityOS buyer demo must never authorize external action');
}
if (packet.priority !== 'P0_CRITICAL') {
  throw new Error('OpportunityOS buyer demo expected P0-Critical on verified $1.4M budget evidence');
}

console.log(JSON.stringify({
  simulation: {
    state: simulation.workOrder.state,
    verified: simulation.verification.verified,
    executionMode: simulation.executionMode,
    externalSideEffects: simulation.externalSideEffects,
    receiptCount: simulation.receipts.length,
  },
  investigation: {
    priority: packet.priority,
    criticalReason: packet.criticalReason,
    approvalReadiness: packet.approvalReadiness,
    externalActionAllowed: packet.externalActionAllowed,
    expectedContractValueCents: packet.commercialValue.contractValue.expectedCents,
    maxBudgetCents: packet.commercialValue.contractValue.maxCents,
    winProbabilityCalibration: packet.winProbability.calibrationState,
  },
  note: 'Simulation-only demo. No marketplace write, message, payment, or deployment occurred.',
}, null, 2));
