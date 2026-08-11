import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresOpportunityStore } from '../src/store.ts';

test('postgres store persists a WorkOrder using parameterized SQL', async () => {
  const calls = [];
  const db = { query: async (text, values = []) => { calls.push({ text, values }); return { rows: [] }; } };
  const store = new PostgresOpportunityStore(db);
  await store.putWorkOrder({ id: 'wo-1', state: 'DRAFT', revision: 0 });
  assert.match(calls[0].text, /insert into work_orders/i);
  assert.equal(calls[0].values[0], 'wo-1');
  assert.equal(calls[0].values[1], 'DRAFT');
  assert.equal(calls[0].values[2], 0);
});

test('postgres store reads a WorkOrder without inventing missing records', async () => {
  const db = { query: async () => ({ rows: [] }) };
  const store = new PostgresOpportunityStore(db);
  assert.equal(await store.getWorkOrder('missing'), undefined);
});
