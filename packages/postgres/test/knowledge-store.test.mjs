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

test('knowledge migration defines persistent registry and isolated source content tables', () => {
  const sql = readFileSync(new URL('../../../database/migrations/002_buildgraph_knowledge.sql', import.meta.url), 'utf8');
  for (const table of ['knowledge_entities', 'knowledge_entity_aliases', 'knowledge_source_records', 'knowledge_source_content', 'knowledge_entity_sources', 'knowledge_relationships', 'knowledge_inbox', 'knowledge_embeddings', 'knowledge_ingestion_receipts']) {
    assert.match(sql, new RegExp(`create table if not exists ${table}`, 'i'));
  }
  assert.match(sql, /unique\s*\(system,\s*source_native_id\)/i);
  assert.match(sql, /to_tsvector\s*\(\s*'simple'\s*,\s*content_text\s*\)/i);
});

test('portfolio preflight migration defines project policies and durable receipts', () => {
  const sql = readFileSync(new URL('../../../database/migrations/003_buildgraph_portfolio_preflight.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists knowledge_project_policies/i);
  assert.match(sql, /create table if not exists knowledge_preflight_receipts/i);
  assert.match(sql, /project_id text primary key references knowledge_entities\(id\)/i);
  assert.match(sql, /receipt_hash text not null unique/i);
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

test('project policy persistence is parameterized and idempotent', async () => {
  const { db, calls } = recordingDb();
  const store = new PostgresKnowledgeStore(db);
  await store.putProjectPolicy({
    projectId: entity.id,
    preflightRequired: true,
    routineBypassAllowed: true,
    updatedAt: entity.updatedAt,
  });
  assert.match(calls[0].text, /insert into knowledge_project_policies/i);
  assert.match(calls[0].text, /on conflict \(project_id\) do update/i);
  assert.deepEqual(calls[0].values.slice(0, 3), [entity.id, true, true]);
});

test('project policy lookup returns undefined rather than inventing a missing policy', async () => {
  const { db } = recordingDb([]);
  const store = new PostgresKnowledgeStore(db);
  assert.equal(await store.getProjectPolicy(entity.id), undefined);
});

test('preflight receipt persistence is parameterized and queryable', async () => {
  const receipt = {
    id: 'knowledge-preflight:abc',
    workId: 'work-1',
    projectId: entity.id,
    scope: 'SUBSTANTIAL',
    outcome: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED',
    reason: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED',
    decision: 'CREATE_NEW',
    justification: 'No reusable project satisfies the requirement',
    evidence: { projectIds: [], constraintIds: ['policy:portfolio-preflight'], decisionIds: [] },
    generatedAt: entity.updatedAt,
    receiptHash: 'receipt-hash',
  };
  const { db, calls } = recordingDb();
  const store = new PostgresKnowledgeStore(db);
  await store.recordPreflightReceipt(receipt);
  assert.match(calls[0].text, /insert into knowledge_preflight_receipts/i);
  assert.match(calls[0].text, /on conflict \(id\) do update/i);
  assert.equal(calls[0].values[0], receipt.id);
  assert.equal(calls[0].values[1], receipt.workId);
  assert.equal(calls[0].text.includes(receipt.justification), false);
});

test('preflight receipt lookup maps persisted evidence without fabrication', async () => {
  const { db } = recordingDb([{
    id: 'knowledge-preflight:abc',
    work_id: 'work-1',
    project_id: entity.id,
    scope: 'SUBSTANTIAL',
    outcome: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED',
    reason: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED',
    decision: 'CREATE_NEW',
    justification: 'No reusable project satisfies the requirement',
    evidence: { projectIds: [], constraintIds: [], decisionIds: [] },
    generated_at: entity.updatedAt,
    receipt_hash: 'receipt-hash',
  }]);
  const store = new PostgresKnowledgeStore(db);
  const result = await store.getPreflightReceipt('knowledge-preflight:abc');
  assert.equal(result.id, 'knowledge-preflight:abc');
  assert.equal(result.scope, 'SUBSTANTIAL');
  assert.equal(result.decision, 'CREATE_NEW');
  assert.deepEqual(result.evidence, { projectIds: [], constraintIds: [], decisionIds: [] });
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

test('private retrieval text is stored separately from source metadata using parameterized SQL', async () => {
  const { db, calls } = recordingDb();
  const store = new PostgresKnowledgeStore(db);
  await store.putSourceContent('source:drive:1', 'private searchable text', 'content-hash');
  assert.match(calls[0].text, /insert into knowledge_source_content/i);
  assert.match(calls[0].text, /on conflict \(source_id\) do update/i);
  assert.deepEqual(calls[0].values, ['source:drive:1', 'private searchable text', 'content-hash']);
  assert.equal(calls[0].text.includes('private searchable text'), false);
});

test('registry search returns normalized stored candidates without inventing rows', async () => {
  const { db } = recordingDb([{ id: entity.id, kind: 'project', canonical_name: 'OpportunityOS', normalized_name: 'opportunityos', status: 'active', tags: ['buildgraph'], metadata: {}, provenance_hash: 'entity-hash', created_at: entity.createdAt, updated_at: entity.updatedAt }]);
  const store = new PostgresKnowledgeStore(db);
  const results = await store.searchRegistry('Opportunity OS', 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, entity.id);
  assert.equal(results[0].canonicalName, 'OpportunityOS');
});

test('cross-source retrieval query returns aliases source refs text relationships and embedding', async () => {
  const { db, calls } = recordingDb([{
    id: entity.id,
    kind: 'project',
    canonical_name: 'OpportunityOS',
    normalized_name: 'opportunityos',
    status: 'active',
    aliases: ['Opportunity OS'],
    source_refs: [{ system: 'github', sourceNativeId: '1331248826', url: 'https://github.com/Full-Stack-Assets/OpportunityOS' }],
    text_content: 'opportunity intelligence automation',
    relationships: ['knowledge:capability:discovery'],
    embedding: [0.8, 0.2],
  }]);
  const store = new PostgresKnowledgeStore(db);
  const results = await store.searchRetrievalCandidates('opportunity automation', 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, entity.id);
  assert.deepEqual(results[0].aliases, ['Opportunity OS']);
  assert.equal(results[0].text, 'opportunity intelligence automation');
  assert.deepEqual(results[0].relationships, ['knowledge:capability:discovery']);
  assert.deepEqual(results[0].embedding, [0.8, 0.2]);
  assert.match(calls[0].text, /knowledge_source_content/i);
  assert.match(calls[0].text, /knowledge_embeddings/i);
  assert.match(calls[0].text, /plainto_tsquery/i);
});
