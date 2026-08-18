import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from '../src/index.ts';

test('exports canonical agentic registry primitives', () => {
  assert.equal(typeof core.validateCanonicalRegistry, 'function');
  assert.equal(typeof core.buildCanonicalRegistrySnapshot, 'function');
  assert.equal(typeof core.getRegistryRecord, 'function');
  assert.equal(typeof core.listRegistryRecords, 'function');
  assert.ok(Array.isArray(core.CANONICAL_ARCHITECTURE_INVENTORY));
});

test('canonical architecture inventory validates without broken references', () => {
  const result = core.validateCanonicalRegistry(core.CANONICAL_ARCHITECTURE_INVENTORY);
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('inventory contains the required architecture classes', () => {
  assert.ok(core.listRegistryRecords(core.CANONICAL_ARCHITECTURE_INVENTORY, 'project').length >= 20);
  assert.ok(core.listRegistryRecords(core.CANONICAL_ARCHITECTURE_INVENTORY, 'catalog').length >= 3);
  assert.ok(core.listRegistryRecords(core.CANONICAL_ARCHITECTURE_INVENTORY, 'integration').length >= 10);
  assert.ok(core.listRegistryRecords(core.CANONICAL_ARCHITECTURE_INVENTORY, 'runtime').length >= 10);
  assert.ok(core.listRegistryRecords(core.CANONICAL_ARCHITECTURE_INVENTORY, 'automation').length >= 4);
});

test('role, skill, and integration library counts preserve the verified source inventory', () => {
  assert.equal(core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, 'catalog.agentic-role-library')?.metadata?.roleSkills, 131);
  assert.equal(core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, 'catalog.agentic-role-library')?.metadata?.stableBaseRoles, 123);
  assert.equal(core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, 'catalog.agentic-role-library')?.metadata?.sectorOverlays, 8);
  assert.equal(core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, 'catalog.agentic-skill-library')?.metadata?.skillCount, 45);
  assert.equal(core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, 'catalog.agentic-integration-library')?.metadata?.integrationCategories, 20);
});

test('unknown external runtimes remain fail-closed', () => {
  for (const id of ['runtime.cursor', 'runtime.grok', 'runtime.manus', 'runtime.claude-code', 'runtime.n8n', 'runtime.temporal']) {
    const runtime = core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, id);
    assert.equal(runtime?.health, 'UNKNOWN');
    assert.equal(runtime?.verification, 'DECLARED');
  }
});

test('private automation payloads are not persisted in the public architecture inventory', () => {
  const automation = core.getRegistryRecord(core.CANONICAL_ARCHITECTURE_INVENTORY, 'automation.chatgpt-inventory');
  assert.equal(automation?.metadata?.privatePayloadsPersisted, false);
  assert.equal(automation?.dataClassification, 'RESTRICTED');
});

test('canonical snapshot is deterministic regardless of input ordering', () => {
  const generatedAt = '2026-08-17T00:00:00.000Z';
  const forward = core.buildCanonicalRegistrySnapshot(core.CANONICAL_ARCHITECTURE_INVENTORY, generatedAt);
  const reversed = core.buildCanonicalRegistrySnapshot([...core.CANONICAL_ARCHITECTURE_INVENTORY].reverse(), generatedAt);
  assert.equal(forward.payloadHash, reversed.payloadHash);
  assert.deepEqual(forward.countsByKind, reversed.countsByKind);
});

test('registry rejects duplicate IDs and missing relationship targets', () => {
  const base = core.CANONICAL_ARCHITECTURE_INVENTORY[0];
  assert.ok(base);
  const invalid = [
    ...core.CANONICAL_ARCHITECTURE_INVENTORY,
    { ...base },
    {
      id: 'project.invalid-reference',
      kind: 'project',
      name: 'Invalid reference fixture',
      lifecycle: 'planned',
      verification: 'DECLARED',
      health: 'NOT_APPLICABLE',
      dataClassification: 'INTERNAL',
      description: 'test fixture',
      relationships: [{ type: 'depends_on', targetId: 'project.does-not-exist' }],
      evidence: [{ sourceType: 'system', sourceRef: 'test', observedAt: '2026-08-17', verified: false }],
    },
  ];
  const result = core.validateCanonicalRegistry(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate registry id')));
  assert.ok(result.errors.some((error) => error.includes('missing relationship target')));
});
