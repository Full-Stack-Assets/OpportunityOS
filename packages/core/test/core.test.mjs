import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  hashCanonical,
  authorizeAction,
  chainReceipt,
  createApproval,
  rankOpportunities,
  transitionWorkOrder,
  compileRequirements,
  decideBuildStart,
  verifyArtifact,
  calculateEconomics,
  runSimulationWorkOrder,
} from '../src/index.ts';

test('canonical hash is stable across object key order', () => {
  const a = { z: 1, nested: { b: true, a: 'x' }, list: [3, 2, 1] };
  const b = { list: [3, 2, 1], nested: { a: 'x', b: true }, z: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(hashCanonical(a), hashCanonical(b));
});

test('trust kernel authorizes only exact payload-bound unexpired approvals', async () => {
  const intent = {
    id: 'action-1',
    actionType: 'SIMULATE_FACTORY',
    payload: { factory: 'SOFTWARE_WEB', requirementIds: ['r1'] },
  };
  const approval = createApproval(intent, {
    approvalId: 'approval-1',
    subject: 'operator@example.test',
    expiresAt: '2026-08-11T20:00:00.000Z',
    signature: 'signed',
  });
  const ok = await authorizeAction(intent, approval, '2026-08-11T19:00:00.000Z', async () => true);
  assert.equal(ok.authorized, true);

  const tampered = { ...intent, payload: { factory: 'AUTOMATION', requirementIds: ['r1'] } };
  const mismatch = await authorizeAction(tampered, approval, '2026-08-11T19:00:00.000Z', async () => true);
  assert.equal(mismatch.authorized, false);
  assert.equal(mismatch.reason, 'PAYLOAD_HASH_MISMATCH');

  const expired = await authorizeAction(intent, approval, '2026-08-11T21:00:00.000Z', async () => true);
  assert.equal(expired.authorized, false);
  assert.equal(expired.reason, 'APPROVAL_EXPIRED');
});

test('receipts are chained to the previous receipt hash', () => {
  const first = chainReceipt(undefined, { actionId: 'a1', outcome: 'AUTHORIZED', occurredAt: '2026-08-11T19:00:00.000Z' });
  const second = chainReceipt(first, { actionId: 'a2', outcome: 'VERIFIED', occurredAt: '2026-08-11T19:01:00.000Z' });
  assert.equal(second.previousReceiptHash, first.receiptHash);
  assert.notEqual(second.receiptHash, first.receiptHash);
});

test('opportunity ranking is deterministic and evidence-aware', () => {
  const ranked = rankOpportunities([
    { id: 'low', capabilityFit: 90, evidenceQuality: 20, expectedValueCents: 100000, effortPoints: 2, deadlineUrgency: 50 },
    { id: 'high', capabilityFit: 90, evidenceQuality: 95, expectedValueCents: 100000, effortPoints: 2, deadlineUrgency: 50 },
  ]);
  assert.equal(ranked[0].id, 'high');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('work orders reject invalid state jumps and support Needs You', () => {
  const base = { id: 'wo-1', state: 'DRAFT', revision: 0 };
  assert.throws(() => transitionWorkOrder(base, 'EXECUTING'), /Invalid WorkOrder transition/);
  const preflight = transitionWorkOrder(base, 'BUILDGRAPH_PREFLIGHT');
  const needsYou = transitionWorkOrder(preflight, 'NEEDS_YOU');
  assert.equal(needsYou.state, 'NEEDS_YOU');
  assert.equal(needsYou.revision, 2);
});

test('requirements compiler returns dependency order and rejects cycles', () => {
  const compiled = compileRequirements([
    { id: 'build', description: 'Build output', dependsOn: ['spec'] },
    { id: 'spec', description: 'Compile requirements', dependsOn: [] },
  ]);
  assert.deepEqual(compiled.order, ['spec', 'build']);
  assert.throws(() => compileRequirements([
    { id: 'a', description: 'A', dependsOn: ['b'] },
    { id: 'b', description: 'B', dependsOn: ['a'] },
  ]), /cycle/i);
});

test('BuildGraph decision fails closed when preflight is missing or recommends reuse', () => {
  assert.deepEqual(decideBuildStart(undefined), { allowed: false, reason: 'BUILDGRAPH_PREFLIGHT_REQUIRED' });
  const reuse = decideBuildStart({
    requestId: 'r1', decision: 'REUSE_EXISTING', justification: 'Existing verified project',
    candidates: [], reusePlan: { reuse: ['trust-kernel'], extend: [], create: [] },
    wasteRisk: { score: 95, estimatedRecreationPercent: 92, factors: [] },
    evidence: { projectIds: ['p1'], constraintIds: [], decisionIds: [] },
    generatedAt: '2026-08-11T19:00:00.000Z', payloadHash: 'hash'
  });
  assert.equal(reuse.allowed, false);
  assert.equal(reuse.reason, 'BUILDGRAPH_REUSE_REQUIRED');
  const create = decideBuildStart({ ...reuse, decision: 'CREATE_NEW', reusePlan: { reuse: [], extend: [], create: ['new'] } });
  assert.equal(create.allowed, true);
});

test('independent verifier rejects a checksum mismatch', () => {
  const payload = 'artifact-body';
  const verified = verifyArtifact({ id: 'artifact-1', content: payload, checksum: hashCanonical(payload) });
  assert.equal(verified.verified, true);
  const bad = verifyArtifact({ id: 'artifact-1', content: payload, checksum: 'bad' });
  assert.equal(bad.verified, false);
  assert.equal(bad.reason, 'CHECKSUM_MISMATCH');
});

test('economics never fabricates unknown revenue and uses integer cents', () => {
  assert.deepEqual(calculateEconomics({ revenueCents: undefined, costCents: 2500 }), {
    revenueCents: undefined,
    costCents: 2500,
    contributionCents: undefined,
    evidenceComplete: false,
  });
  assert.deepEqual(calculateEconomics({ revenueCents: 10000, costCents: 2500 }), {
    revenueCents: 10000,
    costCents: 2500,
    contributionCents: 7500,
    evidenceComplete: true,
  });
});

test('simulation orchestration completes only after BuildGraph, factory, and independent verification', async () => {
  const result = await runSimulationWorkOrder({
    workOrderId: 'wo-sim-1',
    preflight: {
      requestId: 'bg-1', decision: 'CREATE_NEW', justification: 'No reusable project satisfies this capability set',
      candidates: [], reusePlan: { reuse: [], extend: [], create: ['dashboard'] },
      wasteRisk: { score: 5, estimatedRecreationPercent: 2, factors: [] },
      evidence: { projectIds: [], constraintIds: [], decisionIds: [] },
      generatedAt: '2026-08-11T19:00:00.000Z', payloadHash: 'bg-hash'
    },
    requirements: [{ id: 'r1', description: 'Produce dashboard simulation artifact', dependsOn: [] }],
    factory: 'SOFTWARE_WEB',
    now: '2026-08-11T19:00:00.000Z',
  });
  assert.equal(result.workOrder.state, 'COMPLETED');
  assert.equal(result.verification.verified, true);
  assert.equal(result.executionMode, 'SIMULATION');
  assert.equal(result.externalSideEffects, 0);
});
