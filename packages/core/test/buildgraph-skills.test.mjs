import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILDGRAPH_CAPABILITIES,
  resolveCapabilityGraph,
} from '../dist/index.js';

test('resolves ordered prerequisites for client delivery', () => {
  const result = resolveCapabilityGraph('delivery.prepare', new Set(BUILDGRAPH_CAPABILITIES.map((node) => node.id)));
  assert.equal(result.status, 'ready');
  assert.ok(result.orderedIds.indexOf('fulfillment.plan') < result.orderedIds.indexOf('fulfillment.execute'));
  assert.ok(result.orderedIds.indexOf('fulfillment.execute') < result.orderedIds.indexOf('deliverable.verify'));
  assert.ok(result.orderedIds.indexOf('deliverable.verify') < result.orderedIds.indexOf('delivery.prepare'));
});

test('reports missing capabilities instead of fabricating readiness', () => {
  const available = new Set(['fulfillment.plan']);
  const result = resolveCapabilityGraph('delivery.prepare', available);
  assert.equal(result.status, 'blocked');
  assert.ok(result.missingIds.includes('fulfillment.execute'));
  assert.ok(result.missingIds.includes('deliverable.verify'));
});

test('surfaces human gates separately from missing capabilities', () => {
  const available = new Set(BUILDGRAPH_CAPABILITIES.map((node) => node.id));
  const result = resolveCapabilityGraph('application.submit', available);
  assert.equal(result.status, 'human-gated');
  assert.ok(result.humanGateIds.includes('application.submit'));
  assert.deepEqual(result.missingIds, []);
});

test('requires verifier capabilities before completion nodes', () => {
  const delivery = BUILDGRAPH_CAPABILITIES.find((node) => node.id === 'delivery.prepare');
  assert.equal(delivery?.verifier, 'deliverable.verify');
  assert.ok(delivery?.requires.includes('deliverable.verify'));
});

test('rejects dependency cycles', () => {
  assert.throws(
    () => resolveCapabilityGraph('a', new Set(['a', 'b']), [
      { id: 'a', name: 'A', description: 'A', inputs: [], outputs: [], requires: ['b'], permissions: [], evidence: [], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [] },
      { id: 'b', name: 'B', description: 'B', inputs: [], outputs: [], requires: ['a'], permissions: [], evidence: [], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [] },
    ]),
    /cycle/i,
  );
});