import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from '../src/index.ts';

test('exports all twenty governed integration categories and five permission tiers', () => {
  assert.equal(core.INTEGRATION_CATALOG.length, 20);
  assert.deepEqual(core.INTEGRATION_CATALOG.map((item) => item.id), Array.from({ length: 20 }, (_, index) => `INT-${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(Object.keys(core.INTEGRATION_PERMISSION_TIERS), ['I0', 'I1', 'I2', 'I3', 'I4']);
  assert.equal(core.INTEGRATION_PERMISSION_TIERS.I4.humanConfirmationRequired, true);
  assert.equal(core.INTEGRATION_PERMISSION_TIERS.I0.connectionAllowed, false);
});

test('projects every canonical integration record into a governed binding without inventing health', () => {
  const canonicalIntegrations = core.listRegistryRecords(core.CANONICAL_ARCHITECTURE_INVENTORY, 'integration');
  assert.equal(core.INTEGRATION_REGISTRY.length, canonicalIntegrations.length);

  const github = core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.github');
  assert.equal(github?.categoryId, 'INT-007');
  assert.equal(github?.permissionTier, 'I2');
  assert.equal(github?.verification, 'VERIFIED');
  assert.equal(github?.health, 'HEALTHY');
  assert.equal(github?.failureBehavior.failClosed, true);

  const clickup = core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.clickup');
  assert.equal(clickup?.categoryId, 'INT-003');
  assert.equal(clickup?.health, 'DEGRADED');
  assert.equal(clickup?.verification, 'PARTIAL');

  const ideabrowser = core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.ideabrowser');
  assert.equal(ideabrowser?.health, 'UNAVAILABLE');
  assert.equal(ideabrowser?.verification, 'PARTIAL');
});

test('known integrations map to least-privilege categories instead of broad generic access', () => {
  const expected = new Map([
    ['integration.google-drive', ['INT-001', 'I1']],
    ['integration.wisebase', ['INT-001', 'I1']],
    ['integration.airtable', ['INT-009', 'I2']],
    ['integration.gmail', ['INT-020', 'I2']],
    ['integration.github', ['INT-007', 'I2']],
    ['integration.elevenlabs', ['INT-006', 'I2']],
    ['integration.youtube', ['INT-012', 'I2']],
  ]);

  for (const [registryId, [categoryId, tier]] of expected) {
    const binding = core.INTEGRATION_REGISTRY.find((item) => item.registryId === registryId);
    assert.equal(binding?.categoryId, categoryId, registryId);
    assert.equal(binding?.permissionTier, tier, registryId);
  }
});

test('integration starters preserve unknown owners, authentication, and exact scopes until verified', () => {
  const github = core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.github');
  assert.ok(github);
  assert.equal(github.owners.system, null);
  assert.equal(github.owners.technical, null);
  assert.equal(github.owners.businessData, null);
  assert.equal(github.authentication.method, null);
  assert.deepEqual(github.scopes, []);
  assert.equal(core.assessIntegrationReadiness(github).ready, false);
});

test('I4 actions require named human confirmation and cannot be silently executed', () => {
  const binding = structuredClone(core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.github'));
  assert.ok(binding);
  binding.permissionTier = 'I4';
  binding.scopes = [{ object: 'protected-branch', operations: ['human-confirmed-action'], fieldConstraints: [] }];
  binding.humanConfirmation.requiredFor = [];
  const invalid = core.validateIntegrationBinding(binding);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes('I4')));

  binding.humanConfirmation.requiredFor = ['protected-branch-change'];
  binding.humanConfirmation.approvalRecordReference = 'approval://release-owner';
  const valid = core.validateIntegrationBinding(binding);
  assert.equal(valid.valid, true, valid.errors.join('\n'));
});

test('a fully specified bounded integration can reach readiness', () => {
  const binding = structuredClone(core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.google-drive'));
  assert.ok(binding);
  binding.status = 'approved';
  binding.owners.system = 'human://drive-owner';
  binding.owners.technical = 'human://integration-owner';
  binding.owners.businessData = 'human://knowledge-owner';
  binding.authentication.method = 'delegated-user-access';
  binding.approvedRoles = ['role://agentic-role-library/gke-05'];
  binding.dataMinimization = ['approved project folders'];
  binding.scopes = [{ object: 'approved-project-folders', operations: ['read'], fieldConstraints: [] }];
  binding.logging.auditDestination = 'audit://buildgraph/integrations';
  binding.logging.retention = 'P90D';
  binding.monitoring.alerts = ['permission-change', 'authentication-failure', 'error-rate'];
  binding.testPlan = [
    { case: 'authorized-read', expectedResult: 'approved scoped objects only', evidenceLocation: 'evidence://integration/google-drive/read' },
    { case: 'unauthorized-object', expectedResult: 'denied and logged', evidenceLocation: 'evidence://integration/google-drive/deny' },
  ];

  assert.equal(core.validateIntegrationBinding(binding).valid, true);
  assert.equal(core.assessIntegrationReadiness(binding).ready, true);
});

test('secret-like metadata is prohibited from integration bindings', () => {
  const binding = structuredClone(core.INTEGRATION_REGISTRY.find((item) => item.registryId === 'integration.github'));
  assert.ok(binding);
  binding.authentication.method = 'token sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa';
  const result = core.validateIntegrationBinding(binding);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('secret')));
});
