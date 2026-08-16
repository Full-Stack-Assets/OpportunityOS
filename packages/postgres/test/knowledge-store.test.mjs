import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PostgresKnowledgeStore } from '../src/knowledge-store.ts';

function recordingDb(rows = []) {
  const calls = [];
  return {
    calls,
    db: {
      query: async (text, values = []) => {
        calls.push({ text, values });
        return { rows };
      },
    },
  };
}

const entity = {
  id: 'knowledge:project:abc',
  kind: 'project',
  canonicalName: 'OpportunityOS',
  normalizedName: 'opportunityos',
  aliases: ['Opportunity OS'],
  normalizedAliases: ['opportunityos'],
  status: 'active',
  sourceRefs: [],
  tags: ['buildgraph'],
  createdAt: '2026-08-16T15:00:00.000Z',
  updatedAt: '2026-08-16T15:00:00.000Z',
  provenanceHash: 'entity-hash',
};

const source = {
  id: 'source:github:abc',
  system: 'github',
  sourceNativeId: '1331248826',
  title: 'OpportunityOS',
  normalizedTitle: 'opportunityos',
  url: 'https://github.com/Full-Stack-Assets/OpportunityOS',
  observedAt: '2026-08-16T15:00:00.000Z',
  metadata: { visibility: 'public' },
  projectHints: ['OpportunityOS'],
  provenanceHash: 'source-hash',
};

test('knowledge migration defines persistent registry tables and source identity uniqueness', () => {
  const sql = readFileSync(new URL('../../../database/migrations/002_buildgraph_knowledge.sql', import.meta.url), 'utf8');
  for (const table of ['knowledge_entities', 'knowledge_entity_aliases', 'knowledge_source_records', 'knowledge_entity_sources', 'knowledge_relationships', 'knowledge_inbox', 'knowledge_embeddings', 'knowledge_ingestion_receipts']) {
    assert.match(sql, new RegExp(`create table if not exists ${table}`, 'i'));
  }
  assert.match(sql, /unique\s*\(system,\s*source_native_id\)/i);
});

test('knowledge entity upsert uses parameterized SQL and persists aliases idempotently', async () => {
  const { db, calls } = recordingDb();
  const store = new PostgresKnowledgeStore(db);
  await store.putEntity(entity);
  assert.match(calls[0].text, /insert into knowledge_entities/i);
  assert.match(calls[0].text, /on conflict \(id\) do update/i);
  assert.equal(calls[0].values[0], entity.id);
  assert.equal(calls[0].values[2], entity.canonicalName);
  assert.ok(calls.some((call) => /knowledge_entity_aliases/i.test(call.text)));
  assert.equal(calls.some((call) => call.text.includes(entity.canonicalName)), false, 'source values must not be interpolated into SQL');
});

test('source upsert preserves source-native identity and last-seen semantics', async () => {
  const { db, calls } = recordingDb();
  const store = new PostgresKnowledgeStore(db);
  await store.putSourceRecord(source);
  assert.match(calls[0].text, /insert into knowledge_source_records/i);
  assert.match(calls[0].text, /on conflict \(id\) do update/i);
  assert.equal(calls[0].values[1], 'github');
  assert.equal(calls[0].values[2], '1331248826');
  assert.match(calls[0].text, /last_seen_at\s*=\s*now\(\)/i);
});

test('registry search returns normalized stored candidates without inventing rows', async () => {
  const { db } = recordingDb([{ id: entity.id, kind: 'project', canonical_name: 'OpportunityOS', normalized_name: 'opportunityos', status: 'active', tags: ['buildgraph'], metadata: {}, provenance_hash: 'entity-hash', created_at: entity.createdAt, updated_at: entity.updatedAt }]);
  const store = new PostgresKnowledgeStore(db);
  const results = await store.searchRegistry('Opportunity OS', 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, entity.id);
  assert.equal(results[0].canonicalName, 'OpportunityOS');
});
