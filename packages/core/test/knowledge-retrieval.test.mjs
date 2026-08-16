import assert from 'node:assert/strict';
import test from 'node:test';

import { cosineSimilarity, rankKnowledgeResults } from '../src/index.ts';

test('cosine similarity validates dimensions and returns deterministic score', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.throws(() => cosineSimilarity([1], [1, 0]), /dimensions/i);
});

test('exact source identity outranks higher embedding similarity', () => {
  const results = rankKnowledgeResults(
    { text: 'OpportunityOS', sourceSystem: 'github', sourceNativeId: 'repo-1', embedding: [1, 0] },
    [
      { id: 'exact', normalizedName: 'other', aliases: [], sourceRefs: [{ system: 'github', sourceNativeId: 'repo-1' }], text: '', relationships: [], embedding: [0, 1] },
      { id: 'semantic', normalizedName: 'opportunityos', aliases: [], sourceRefs: [], text: 'OpportunityOS platform', relationships: [], embedding: [1, 0] },
    ],
  );
  assert.equal(results[0].id, 'exact');
  assert.equal(results[0].sourceIdentityScore, 1);
  assert.ok(results[1].embeddingScore > results[0].embeddingScore);
});

test('retrieval exposes lexical relationship and embedding components separately', () => {
  const results = rankKnowledgeResults(
    { text: 'HostGraph procurement', relatedEntityIds: ['supplier'], embedding: [1, 0] },
    [
      { id: 'hostgraph', normalizedName: 'hostgraph', aliases: ['host graph'], sourceRefs: [], text: 'restaurant procurement margin intelligence', relationships: ['supplier'], embedding: [0.8, 0.2] },
    ],
  );
  assert.equal(results.length, 1);
  assert.ok(results[0].nameScore > 0);
  assert.ok(results[0].textScore > 0);
  assert.equal(results[0].relationshipScore, 1);
  assert.ok(results[0].embeddingScore > 0);
  assert.ok(results[0].combinedScore > 0);
});
