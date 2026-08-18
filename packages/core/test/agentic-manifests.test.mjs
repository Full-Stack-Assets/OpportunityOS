import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from '../src/index.ts';

test('exports universal role and skill manifest primitives', () => {
  assert.equal(core.ROLE_MANIFEST_API_VERSION, 'agenticroles.dev/v1alpha1');
  assert.equal(core.SKILL_MANIFEST_FORMAT, 'agent-skills-compatible/v1');
  assert.equal(typeof core.validateRoleManifest, 'function');
  assert.equal(typeof core.validateSkillManifest, 'function');
  assert.equal(typeof core.assessRoleManifestReadiness, 'function');
  assert.equal(typeof core.assessSkillManifestReadiness, 'function');
});

test('projects all 131 roles and 45 reusable skills into deterministic portable starter manifests', () => {
  assert.equal(core.UNIVERSAL_ROLE_MANIFESTS.length, 131);
  assert.equal(core.UNIVERSAL_SKILL_MANIFESTS.length, 45);

  const role = core.UNIVERSAL_ROLE_MANIFESTS.find((item) => item.metadata.catalogId === 'CMO-01');
  assert.equal(role?.metadata.id, 'role://agentic-role-library/cmo-01');
  assert.equal(role?.metadata.name, 'Artist Operations Orchestrator');
  assert.equal(role?.kind, 'RoleType');
  assert.equal(role?.metadata.status, 'draft');
  assert.equal(role?.source.verification, 'VERIFIED');

  const skill = core.UNIVERSAL_SKILL_MANIFESTS.find((item) => item.metadata.catalogId === 'SKL-001');
  assert.equal(skill?.metadata.id, 'skill://agentic-skill-library/skl-001');
  assert.equal(skill?.metadata.name, 'Structured Intake Normalization');
  assert.equal(skill?.kind, 'Skill');
  assert.equal(skill?.metadata.status, 'draft');
  assert.equal(skill?.source.verification, 'VERIFIED');
});

test('role manifests keep capability and authority as separate first-class sections', () => {
  const role = core.UNIVERSAL_ROLE_MANIFESTS.find((item) => item.metadata.catalogId === 'ESP-02');
  assert.ok(role);
  assert.ok(role.capabilities);
  assert.ok(role.authority);
  assert.notEqual(role.capabilities, role.authority);
  assert.deepEqual(role.capabilities.skills, []);
  assert.deepEqual(role.capabilities.tools, []);
  assert.deepEqual(role.authority.may, []);
  assert.deepEqual(role.authority.mustNot, []);
});

test('starter role manifests preserve unknown semantics instead of fabricating mission, authority, or handoffs', () => {
  const role = core.UNIVERSAL_ROLE_MANIFESTS.find((item) => item.metadata.catalogId === 'GKE-03');
  assert.ok(role);
  assert.equal(role.mission.statement, null);
  assert.deepEqual(role.responsibilities, []);
  assert.deepEqual(role.inputs, []);
  assert.deepEqual(role.outputs, []);
  assert.deepEqual(role.handoffs.receives, []);
  assert.deepEqual(role.handoffs.sends, []);
  assert.equal(core.assessRoleManifestReadiness(role).ready, false);
});

test('role readiness requires typed outputs, bounded authority, handoff semantics, verification, governance, and provenance', () => {
  const role = structuredClone(core.UNIVERSAL_ROLE_MANIFESTS.find((item) => item.metadata.catalogId === 'ESP-04'));
  assert.ok(role);

  role.mission.statement = 'Independently verify bounded software changes against explicit acceptance criteria.';
  role.mission.outcomes = ['Verification result is evidence-backed.'];
  role.responsibilities = [{ id: 'verify-change', statement: 'Verify supplied change evidence.', criticality: 'required' }];
  role.inputs = [{ id: 'change', type: 'artifact://software/change', required: true }];
  role.outputs = [{ id: 'decision', type: 'artifact://quality/verification-decision', required: true, qualityGates: ['evidence references resolve'] }];
  role.capabilities.skills = [{ ref: 'skill://agentic-skill-library/skl-028', required: true }];
  role.authority.autonomyLevel = 'bounded';
  role.authority.may = ['read supplied verification evidence'];
  role.authority.mustNot = ['merge protected branches'];
  role.authority.approvalsRequired = [{ action: 'protected-branch-change', approverRole: 'human://release-owner' }];
  role.authority.delegation = { permitted: false, propagatesPermissions: false, maximumDepth: 0 };
  role.handoffs.sends = [{ to: 'human://release-owner', when: 'verification complete', requires: ['artifact://quality/verification-decision'], recipientMustVerify: ['acceptance criteria'], onReject: 'return_to_author', onPolicyViolation: 'escalate' }];
  role.verification.assertions = [{ id: 'evidence-complete', type: 'schema', expression: 'required_evidence.present == true' }];
  role.verification.evalSuites = ['eval://roles/test-engineering/core@1'];
  role.governance.owner = 'human://quality-owner';
  role.governance.riskClass = 'medium';
  role.provenance.publisher = 'org://agentic-role-library';
  role.provenance.sourceRevision = 'git:test-fixture';
  role.provenance.artifactDigest = 'sha256:test-fixture';

  assert.equal(core.validateRoleManifest(role).valid, true);
  assert.equal(core.assessRoleManifestReadiness(role).ready, true);
});

test('skill manifests remain Agent Skills compatible and require routing plus evaluation evidence before readiness', () => {
  const skill = structuredClone(core.UNIVERSAL_SKILL_MANIFESTS.find((item) => item.metadata.catalogId === 'SKL-008'));
  assert.ok(skill);
  assert.equal(skill.compatibility.standard, 'Agent Skills');
  assert.equal(skill.compatibility.skillMdCompatible, true);
  assert.equal(core.assessSkillManifestReadiness(skill).ready, false);

  skill.activation.shouldTrigger = ['User requests grounded synthesis from approved sources.'];
  skill.activation.shouldNotTrigger = ['No approved source material is available.'];
  skill.inputs = [{ id: 'sources', type: 'artifact://knowledge/source-set', required: true }];
  skill.outputs = [{ id: 'synthesis', type: 'artifact://knowledge/grounded-synthesis', required: true }];
  skill.evaluation.fixtures = ['eval://skills/skl-008/core@1'];
  skill.evaluation.expectedBehavior = ['unsupported claims are omitted or surfaced as gaps'];
  skill.provenance.publisher = 'org://agentic-role-library';
  skill.provenance.sourceRevision = 'git:test-fixture';
  skill.provenance.artifactDigest = 'sha256:test-fixture';

  assert.equal(core.validateSkillManifest(skill).valid, true);
  assert.equal(core.assessSkillManifestReadiness(skill).ready, true);
});

test('manifest validation rejects unstable identifiers and missing source provenance', () => {
  const role = structuredClone(core.UNIVERSAL_ROLE_MANIFESTS[0]);
  role.metadata.id = 'agent-without-uri';
  role.source.ref = '';
  const roleResult = core.validateRoleManifest(role);
  assert.equal(roleResult.valid, false);
  assert.ok(roleResult.errors.some((error) => error.includes('role://')));
  assert.ok(roleResult.errors.some((error) => error.includes('source')));

  const skill = structuredClone(core.UNIVERSAL_SKILL_MANIFESTS[0]);
  skill.metadata.id = 'skill-without-uri';
  skill.source.ref = '';
  const skillResult = core.validateSkillManifest(skill);
  assert.equal(skillResult.valid, false);
  assert.ok(skillResult.errors.some((error) => error.includes('skill://')));
  assert.ok(skillResult.errors.some((error) => error.includes('source')));
});
