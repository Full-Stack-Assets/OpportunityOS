import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from '../src/index.ts';

test('exports common adapters for the seven target agent runtimes', () => {
  assert.deepEqual(core.RUNTIME_ADAPTERS.map((adapter) => adapter.id), [
    'chatgpt',
    'codex',
    'cursor',
    'grok',
    'manus',
    'claude-code',
    'github-actions',
  ]);
  assert.equal(typeof core.getRuntimeAdapter, 'function');
  assert.equal(typeof core.assessRuntimeAdapterReadiness, 'function');
  assert.equal(typeof core.projectRoleManifestToRuntime, 'function');
});

test('adapter health is projected from the canonical runtime registry without optimistic promotion', () => {
  const chatgpt = core.getRuntimeAdapter('chatgpt');
  assert.equal(chatgpt.runtimeRegistryId, 'runtime.chatgpt');
  assert.equal(chatgpt.verification, 'VERIFIED');
  assert.equal(chatgpt.health, 'HEALTHY');
  assert.equal(chatgpt.lifecycle, 'active');
  assert.equal(core.assessRuntimeAdapterReadiness(chatgpt).ready, true);

  for (const id of ['codex', 'cursor', 'grok', 'manus', 'claude-code']) {
    const adapter = core.getRuntimeAdapter(id);
    assert.equal(adapter.verification, 'DECLARED', id);
    assert.equal(adapter.health, 'UNKNOWN', id);
    assert.equal(adapter.lifecycle, 'planned', id);
    assert.equal(core.assessRuntimeAdapterReadiness(adapter).ready, false, id);
  }

  const github = core.getRuntimeAdapter('github-actions');
  assert.equal(github.verification, 'PARTIAL');
  assert.equal(github.health, 'UNKNOWN');
  assert.equal(core.assessRuntimeAdapterReadiness(github).ready, false);
});

test('every adapter implements the same bounded runtime interface', () => {
  for (const adapter of core.RUNTIME_ADAPTERS) {
    assert.ok(adapter.transport.kind);
    assert.ok(Array.isArray(adapter.capabilities));
    assert.ok(Array.isArray(adapter.supportedRoleFields));
    assert.equal(adapter.guardrails.failClosed, true);
    assert.equal(adapter.guardrails.credentialsInPayload, false);
    assert.equal(adapter.guardrails.authorityEscalationRequired, true);
    assert.equal(adapter.observability.traceRequired, true);
  }
});

test('runtime role projection preserves source identity and separates authority from capability', () => {
  const source = structuredClone(core.UNIVERSAL_ROLE_MANIFESTS.find((item) => item.metadata.catalogId === 'ESP-02'));
  assert.ok(source);
  source.mission.statement = 'Implement approved software changes inside a bounded specification.';
  source.responsibilities = [{ id: 'implement', statement: 'Implement the approved change.', criticality: 'required' }];
  source.capabilities.skills = [{ ref: 'skill://agentic-skill-library/skl-026', required: true }];
  source.capabilities.tools = [{ ref: 'mcp://github', required: true, permissions: ['read:repo', 'write:branch'] }];
  source.authority.autonomyLevel = 'bounded';
  source.authority.may = ['write feature branch'];
  source.authority.mustNot = ['merge protected branch'];
  source.outputs = [{ id: 'change', type: 'artifact://software/change', required: true, qualityGates: ['tests pass'] }];

  const snapshot = structuredClone(source);
  const projection = core.projectRoleManifestToRuntime(source, 'codex');

  assert.equal(projection.sourceRoleId, source.metadata.id);
  assert.equal(projection.runtimeAdapterId, 'codex');
  assert.match(projection.instructions, /Implement approved software changes/);
  assert.deepEqual(projection.skills, ['skill://agentic-skill-library/skl-026']);
  assert.deepEqual(projection.tools, [{ ref: 'mcp://github', permissions: ['read:repo', 'write:branch'] }]);
  assert.deepEqual(projection.authority.may, ['write feature branch']);
  assert.deepEqual(projection.authority.mustNot, ['merge protected branch']);
  assert.deepEqual(projection.outputTypes, ['artifact://software/change']);
  assert.deepEqual(source, snapshot);
});

test('runtime projection refuses unknown adapters and unstable role manifests', () => {
  const role = structuredClone(core.UNIVERSAL_ROLE_MANIFESTS[0]);
  assert.throws(() => core.projectRoleManifestToRuntime(role, 'does-not-exist'), /UNKNOWN_RUNTIME_ADAPTER/);

  role.metadata.id = 'bad-id';
  assert.throws(() => core.projectRoleManifestToRuntime(role, 'chatgpt'), /INVALID_ROLE_MANIFEST/);
});

test('runtime adapter structures never contain raw credentials or secret-shaped values', () => {
  const serialized = JSON.stringify(core.RUNTIME_ADAPTERS);
  assert.doesNotMatch(serialized, /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/i);
  assert.doesNotMatch(serialized, /access[_-]?token/i);
  assert.doesNotMatch(serialized, /refresh[_-]?token/i);
  assert.doesNotMatch(serialized, /password/i);
});
