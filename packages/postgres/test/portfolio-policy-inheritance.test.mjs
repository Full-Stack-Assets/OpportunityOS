import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../database/migrations/003_buildgraph_portfolio_preflight.sql', import.meta.url),
  'utf8',
);

test('new project entities automatically inherit the portfolio preflight policy', () => {
  assert.match(migration, /create or replace function ensure_knowledge_project_policy\s*\(\s*\)/i);
  assert.match(migration, /if new\.kind = 'project'/i);
  assert.match(migration, /insert into knowledge_project_policies/i);
  assert.match(migration, /values \(new\.id, true, true/i);
  assert.match(migration, /on conflict \(project_id\) do nothing/i);
  assert.match(migration, /create trigger knowledge_project_policy_inherit/i);
  assert.match(migration, /after insert on knowledge_entities/i);
});

test('automatic inheritance never overwrites an explicit project policy', () => {
  assert.match(migration, /on conflict \(project_id\) do nothing/i);
  assert.doesNotMatch(migration, /on conflict \(project_id\) do update[\s\S]*ensure_knowledge_project_policy/i);
});
