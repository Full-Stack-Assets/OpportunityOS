import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorkScope,
  evaluatePortfolioPreflight,
  createPortfolioPreflightReceipt,
} from '../src/index.ts';

const policy = {
  preflightRequired: true,
  routineBypassAllowed: true,
};

const noReuse = {
  request: {
    name: 'New widget engine',
    description: 'new reusable engine',
    capabilities: ['widget.engine'],
  },
  status: 'NO_REUSE_EVIDENCE',
  allowCreateNew: true,
  candidates: [],
  sourceEvidence: [],
  activeCandidates: [],
  archivedCandidates: [],
  decisionsAndConstraints: [],
  reusableAssets: [],
};

const createNew = {
  requestId: 'pf-1',
  decision: 'CREATE_NEW',
  justification: 'No reusable project satisfies the required capability',
  candidates: [],
  reusePlan: { reuse: [], extend: [], create: ['widget-engine'] },
  wasteRisk: { score: 2, estimatedRecreationPercent: 1, factors: [] },
  evidence: { projectIds: [], constraintIds: ['policy:portfolio-preflight'], decisionIds: [] },
  generatedAt: '2026-08-24T18:00:00.000Z',
  payloadHash: 'payload-1',
};

function work(overrides = {}) {
  return {
    id: 'work-1',
    kind: 'BUG_FIX',
    summary: 'Fix parser null check',
    createsReusableCapability: false,
    changesArchitecture: false,
    ...overrides,
  };
}

test('routine maintenance bypasses fresh preflight', () => {
  const request = work();
  assert.equal(classifyWorkScope(request), 'ROUTINE');
  const result = evaluatePortfolioPreflight(request, policy, undefined, undefined);
  assert.deepEqual(result, {
    allowed: true,
    scope: 'ROUTINE',
    reason: 'ROUTINE_BYPASS',
  });
});

test('new project and material feature work are substantial', () => {
  assert.equal(classifyWorkScope(work({ kind: 'NEW_PROJECT', createsReusableCapability: true, changesArchitecture: true })), 'SUBSTANTIAL');
  assert.equal(classifyWorkScope(work({ kind: 'FEATURE', summary: 'Add persistent agent subsystem', createsReusableCapability: true })), 'SUBSTANTIAL');
});

test('scope escalation reclassifies routine work as substantial', () => {
  assert.equal(classifyWorkScope(work({ changesArchitecture: true })), 'SUBSTANTIAL');
});

test('substantial work fails closed without knowledge evidence', () => {
  const request = work({ kind: 'NEW_PROJECT', createsReusableCapability: true, changesArchitecture: true });
  const result = evaluatePortfolioPreflight(request, policy, undefined, undefined);
  assert.equal(result.allowed, false);
  assert.equal(result.scope, 'SUBSTANTIAL');
  assert.equal(result.reason, 'BUILDGRAPH_PREFLIGHT_REQUIRED');
});

test('unavailable knowledge blocks substantial work', () => {
  const request = work({ kind: 'FEATURE', createsReusableCapability: true });
  const unavailable = { ...noReuse, status: 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE', allowCreateNew: false };
  const result = evaluatePortfolioPreflight(request, policy, unavailable, createNew);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE');
});

test('ambiguous knowledge blocks substantial work for review', () => {
  const request = work({ kind: 'FEATURE', createsReusableCapability: true });
  const review = { ...noReuse, status: 'REVIEW', allowCreateNew: false };
  const result = evaluatePortfolioPreflight(request, policy, review, createNew);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'BUILDGRAPH_REVIEW_REQUIRED');
});

test('reuse evidence blocks parallel creation and returns required target', () => {
  const request = work({ kind: 'FEATURE', summary: 'New acquisition engine', createsReusableCapability: true, changesArchitecture: true });
  const evidence = {
    ...noReuse,
    status: 'REUSE_EVIDENCE_FOUND',
    allowCreateNew: false,
    activeCandidates: ['knowledge:project:opportunityos'],
    reusableAssets: ['knowledge:project:opportunityos'],
  };
  const reuse = {
    ...createNew,
    decision: 'EXTEND_EXISTING',
    primaryProjectId: 'knowledge:project:opportunityos',
  };
  const result = evaluatePortfolioPreflight(request, policy, evidence, reuse);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'BUILDGRAPH_REUSE_REQUIRED');
  assert.equal(result.primaryProjectId, 'knowledge:project:opportunityos');
});

test('CREATE_NEW requires no-reuse evidence and explicit justification', () => {
  const request = work({ id: 'work-create', kind: 'NEW_PROJECT', summary: 'Create unique engine', createsReusableCapability: true, changesArchitecture: true });
  const result = evaluatePortfolioPreflight(request, policy, noReuse, createNew);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'BUILDGRAPH_CREATE_NEW_AUTHORIZED');
  assert.equal(result.justification, createNew.justification);

  const blank = evaluatePortfolioPreflight(request, policy, noReuse, { ...createNew, justification: '   ' });
  assert.equal(blank.allowed, false);
  assert.equal(blank.reason, 'BUILDGRAPH_CREATE_NEW_JUSTIFICATION_REQUIRED');
});

test('explicit policy can require preflight for routine work', () => {
  const request = work();
  const strictPolicy = { preflightRequired: true, routineBypassAllowed: false };
  const result = evaluatePortfolioPreflight(request, strictPolicy, undefined, undefined);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'BUILDGRAPH_PREFLIGHT_REQUIRED');
});

test('receipt hash is deterministic for identical decisions', () => {
  const request = work({ id: 'work-create', kind: 'NEW_PROJECT', summary: 'Create unique engine', createsReusableCapability: true, changesArchitecture: true });
  const decision = evaluatePortfolioPreflight(request, policy, noReuse, createNew);
  const a = createPortfolioPreflightReceipt(decision, '2026-08-24T18:00:00.000Z');
  const b = createPortfolioPreflightReceipt(decision, '2026-08-24T18:00:00.000Z');
  assert.equal(a.receiptHash, b.receiptHash);
  assert.equal(a.workId, 'work-create');
  assert.equal(a.scope, 'SUBSTANTIAL');
  assert.equal(a.decision, 'CREATE_NEW');
});

test('blocked substantial decisions also produce durable receipts', () => {
  const request = work({ id: 'work-blocked', kind: 'NEW_PROJECT', summary: 'Create overlapping engine', createsReusableCapability: true, changesArchitecture: true });
  const decision = evaluatePortfolioPreflight(request, policy, undefined, undefined);
  assert.equal(decision.allowed, false);
  assert.equal(decision.workId, 'work-blocked');
  const receipt = createPortfolioPreflightReceipt(decision, '2026-08-24T18:05:00.000Z');
  assert.equal(receipt.workId, 'work-blocked');
  assert.equal(receipt.outcome, 'BUILDGRAPH_PREFLIGHT_REQUIRED');
  assert.equal(receipt.scope, 'SUBSTANTIAL');
});
