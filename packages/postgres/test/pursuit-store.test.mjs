import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresPursuitStore } from '../src/pursuit-store.ts';

class FakeDb {
  calls = [];
  responses = [];
  async query(text, values = []) {
    this.calls.push({ text, values });
    return this.responses.shift() ?? { rows: [] };
  }
}

test('prepared application persistence is parameterized and stores canonical JSON', async () => {
  const db = new FakeDb();
  const store = new PostgresPursuitStore(db);
  await store.savePreparedApplication({ pursuitId: 'p1', opportunityId: 'o1', platform: 'freelancer', payloadHash: 'hash', application: { proposalText: 'hello' }, preparedAt: '2099-01-01T00:00:00Z', expiresAt: '2099-01-02T00:00:00Z' });
  assert.match(db.calls[0].text, /insert into pursuit_applications/i);
  assert.equal(db.calls[0].values[0], 'p1');
  assert.deepEqual(db.calls[0].values[4], { proposalText: 'hello' });
});

test('existing idempotency key is returned before a new attempt', async () => {
  const db = new FakeDb();
  db.responses.push({ rows: [{ action_id: 'a1', status: 'SUBMITTED_VERIFIED', external_id: 'bid-1', reconciliation_required: false }] });
  const store = new PostgresPursuitStore(db);
  const found = await store.findByIdempotencyKey('idem-1');
  assert.deepEqual(found, { actionId: 'a1', status: 'SUBMITTED_VERIFIED', externalId: 'bid-1', reconciliationRequired: false });
  assert.equal(db.calls[0].values[0], 'idem-1');
});

test('executed-unverified is persisted as reconciliation-required', async () => {
  const db = new FakeDb();
  const store = new PostgresPursuitStore(db);
  await store.recordExecution('a1', 'EXECUTED_UNVERIFIED', undefined);
  assert.match(db.calls[0].text, /reconciliation_required/i);
  assert.equal(db.calls[0].values.includes(true), true);
});
