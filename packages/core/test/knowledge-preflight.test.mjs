import assert from 'node:assert/strict';
import test from 'node:test';

import { compileKnowledgePreflight, decideKnowledgePreflightAvailability } from '../src/index.ts';

test('knowledge preflight surfaces reusable projects repositories constraints and source evidence', () => {
  const result = compileKnowledgePreflight(
    { name: 'Opportunity OS', description: 'Opportunity intelligence and fulfillment', capabilities: ['opportunity discovery', 'automation'] },
    {
      available: true,
      results: [
        { id: 'project-1', kind: 'project', canonicalName: 'OpportunityOS', status: 'active', combinedScore: 0.94, sourceIdentityScore: 0, reasons: ['exact-normalized-name'], sourceRefs: [{ system: 'github', sourceNativeId: '1331248826' }] },
        { id: 'repo-1', kind: 'repository', canonicalName: 'Full-Stack-Assets/OpportunityOS', status: 'active', combinedScore: 0.86, sourceIdentityScore: 0, reasons: ['related-capability'], sourceRefs: [{ system: 'github', sourceNativeId: '1331248826' }] },
        { id: 'constraint-1', kind: 'constraint', canonicalName: 'No Vercel', status: 'active', combinedScore: 0.7, sourceIdentityScore: 0, reasons: ['related-project'], sourceRefs: [] },
      ],
    },
  );
  assert.equal(result.status, 'REUSE_EVIDENCE_FOUND');
  assert.equal(result.candidates.length, 3);
  assert.ok(result.sourceEvidence.some((item) => item.system === 'github'));
  assert.equal(result.allowCreateNew, false);
});

test('strong ambiguous canonical matches fail closed to review', () => {
  const result = compileKnowledgePreflight(
    { name: 'Vapor Loop', description: 'automation', capabilities: [] },
    {
      available: true,
      ambiguous: true,
      results: [
        { id: 'a', kind: 'project', canonicalName: 'VaporLoop', status: 'active', combinedScore: 0.92, sourceIdentityScore: 0, reasons: [], sourceRefs: [] },
        { id: 'b', kind: 'project', canonicalName: 'Vapor Loop', status: 'active', combinedScore: 0.91, sourceIdentityScore: 0, reasons: [], sourceRefs: [] },
      ],
    },
  );
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.allowCreateNew, false);
});

test('archived-only strong reuse evidence routes to review instead of active reuse', () => {
  const result = compileKnowledgePreflight(
    { name: 'Archived Prototype', description: 'similar capability', capabilities: ['automation'] },
    {
      available: true,
      ambiguous: false,
      results: [
        { id: 'archived-1', kind: 'project', canonicalName: 'Archived Prototype', status: 'archived', combinedScore: 0.95, sourceIdentityScore: 0, reasons: ['exact-normalized-name'], sourceRefs: [{ system: 'github', sourceNativeId: 'archived-repo' }] },
      ],
    },
  );
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.allowCreateNew, false);
  assert.deepEqual(result.archivedCandidates, ['archived-1']);
});

test('registry unavailable fails closed instead of allowing CREATE_NEW', () => {
  const result = compileKnowledgePreflight(
    { name: 'New Thing', description: 'new build', capabilities: [] },
    { available: false, results: [] },
  );
  assert.equal(decideKnowledgePreflightAvailability(result), 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE');
  assert.equal(result.allowCreateNew, false);
});

test('verified absence of reusable evidence may allow CREATE_NEW', () => {
  const result = compileKnowledgePreflight(
    { name: 'Distinct Build', description: 'unique capability', capabilities: ['novel-x'] },
    { available: true, ambiguous: false, results: [] },
  );
  assert.equal(result.status, 'NO_REUSE_EVIDENCE');
  assert.equal(result.allowCreateNew, true);
  assert.equal(decideKnowledgePreflightAvailability(result), 'READY');
});
