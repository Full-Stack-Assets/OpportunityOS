import { runSimulationWorkOrder } from '../packages/core/src/index.ts';

const result = await runSimulationWorkOrder({
  workOrderId: 'smoke-work-order',
  preflight: {
    requestId: 'smoke-preflight',
    decision: 'CREATE_NEW',
    justification: 'Smoke fixture explicitly represents a successful BuildGraph CREATE_NEW response.',
    candidates: [],
    reusePlan: { reuse: [], extend: [], create: ['smoke-artifact'] },
    wasteRisk: { score: 0, estimatedRecreationPercent: 0, factors: [] },
    evidence: { projectIds: [], constraintIds: [], decisionIds: [] },
    generatedAt: '2026-08-11T19:00:00.000Z',
    payloadHash: 'smoke-preflight-fixture',
  },
  requirements: [{ id: 'smoke', description: 'Create a simulation-only smoke artifact', dependsOn: [] }],
  factory: 'SOFTWARE_WEB',
  now: '2026-08-11T19:00:00.000Z',
});

if (result.workOrder.state !== 'COMPLETED' || !result.verification.verified || result.externalSideEffects !== 0) {
  throw new Error('OpportunityOS smoke verification failed');
}
console.log(JSON.stringify({
  state: result.workOrder.state,
  verified: result.verification.verified,
  executionMode: result.executionMode,
  externalSideEffects: result.externalSideEffects,
  receiptCount: result.receipts.length,
}));
