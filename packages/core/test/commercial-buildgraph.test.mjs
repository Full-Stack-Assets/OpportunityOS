import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

function preflight(overrides = {}) {
  return {
    requestId: 'bg-request-1',
    decision: 'EXTEND_EXISTING',
    justification: 'verified reuse candidate',
    primaryProjectId: 'project:opportunityos',
    candidates: [],
    reusePlan: {reuse: [], extend: ['project:opportunityos'], create: []},
    wasteRisk: {score: 0.2, estimatedRecreationPercent: 20, factors: []},
    evidence: {projectIds: ['project:opportunityos'], constraintIds: [], decisionIds: []},
    generatedAt: '2026-08-16T17:00:00Z',
    payloadHash: 'payload-hash-1',
    ...overrides,
  };
}

test('verified BuildGraph evidence produces a verified capability match', () => {
  assert.equal(typeof core.crossMatchBuildGraphCommercialEvidence, 'function', 'crossMatchBuildGraphCommercialEvidence must be implemented and exported');
  const result = core.crossMatchBuildGraphCommercialEvidence({
    demandText: 'Need an AI workflow automation and CRM integration',
    evidence: {
      preflight: preflight(),
      items: [{
        id: 'project:opportunityos',
        kind: 'PROJECT',
        title: 'OpportunityOS',
        description: 'AI workflow automation and CRM integration opportunity routing',
        tags: ['ai', 'automation', 'crm', 'integration'],
        verified: true,
        evidenceRefs: ['buildgraph:project:opportunityos'],
      }],
    },
  });
  assert.equal(result.state, 'VERIFIED_MATCH');
  assert.ok(result.score >= 0.7);
  assert.deepEqual(result.projectIds, ['project:opportunityos']);
  assert.equal(result.reuseDecision, 'EXTEND_EXISTING');
});

test('unverified BuildGraph IDs cannot manufacture commercial capability proof', () => {
  const result = core.crossMatchBuildGraphCommercialEvidence({
    demandText: 'AI automation',
    evidence: {
      preflight: preflight({
        evidence: {projectIds: ['project:imaginary'], constraintIds: [], decisionIds: []},
        primaryProjectId: 'project:imaginary',
      }),
      items: [{
        id: 'project:imaginary',
        kind: 'PROJECT',
        title: 'Imaginary',
        description: 'AI automation',
        tags: ['ai', 'automation'],
        verified: false,
        evidenceRefs: [],
      }],
    },
  });
  assert.equal(result.state, 'EVIDENCE_GAP');
  assert.equal(result.score, null);
  assert.ok(result.proofPlan.includes('VERIFY_BUILDGRAPH_CAPABILITY_EVIDENCE'));
});

test('verified low-overlap evidence remains partial rather than full proof', () => {
  const result = core.crossMatchBuildGraphCommercialEvidence({
    demandText: 'Need procurement margin recovery automation',
    evidence: {
      preflight: preflight({decision: 'CREATE_NEW'}),
      items: [{
        id: 'artifact:workflow',
        kind: 'ARTIFACT',
        title: 'Workflow Engine',
        description: 'general workflow automation',
        tags: ['automation'],
        verified: true,
        evidenceRefs: ['buildgraph:artifact:workflow'],
      }],
    },
  });
  assert.equal(result.state, 'PARTIAL_MATCH');
  assert.ok(result.score > 0 && result.score < 0.7);
  assert.deepEqual(result.artifactIds, ['artifact:workflow']);
});

test('missing BuildGraph evidence is an explicit evidence gap', () => {
  const result = core.crossMatchBuildGraphCommercialEvidence({
    demandText: 'Need an AI automation platform',
    evidence: null,
  });
  assert.equal(result.state, 'EVIDENCE_GAP');
  assert.equal(result.score, null);
  assert.equal(result.reuseDecision, null);
});
