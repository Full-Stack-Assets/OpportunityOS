import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalEntity,
  createIngestionReceipt,
  createSourceRecord,
  ingestKnowledgeBatch,
} from '../src/index.ts';

function entity(name, aliases = []) {
  return createCanonicalEntity({
    kind: 'project',
    canonicalName: name,
    aliases,
    status: 'active',
    sourceRefs: [],
    tags: [],
    createdAt: '2026-08-16T15:00:00.000Z',
    updatedAt: '2026-08-16T15:00:00.000Z',
  });
}

function source(id, title) {
  return createSourceRecord({
    system: 'github',
    sourceNativeId: id,
    title,
    observedAt: '2026-08-16T15:30:00.000Z',
    metadata: {},
  });
}

test('batch ingestion classifies link, create, and review without aborting the batch', () => {
  const existing = [entity('VaporLoop', ['vapor-loop']), entity('Vapor Loop', ['vapor-loop'])];
  const items = [source('1', 'vapor-loop'), source('2', 'Photobeam')];
  const result = ingestKnowledgeBatch(items, existing);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].disposition, 'REVIEW');
  assert.equal(result.items[1].disposition, 'CREATE_ENTITY');
  assert.deepEqual(result.stats, { attempted: 2, linked: 0, updated: 0, createdCandidates: 1, review: 1, skipped: 0, failed: 0 });
});

test('batch ingestion captures malformed rows as failures instead of inventing source records', () => {
  const result = ingestKnowledgeBatch([null, { title: '' }], []);
  assert.equal(result.items.length, 0);
  assert.equal(result.failures.length, 2);
  assert.equal(result.stats.failed, 2);
});

test('ingestion receipt hash is stable for identical input', () => {
  const stats = { attempted: 3, linked: 1, updated: 1, createdCandidates: 1, review: 0, skipped: 0, failed: 0 };
  const first = createIngestionReceipt('github', '2026-08-16T15:30:00.000Z', stats);
  const second = createIngestionReceipt('github', '2026-08-16T15:30:00.000Z', stats);
  assert.equal(first.id, second.id);
  assert.equal(first.receiptHash, second.receiptHash);
});
