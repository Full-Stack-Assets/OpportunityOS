import { AGENT_ROLE_INVENTORY, AGENT_SKILL_INVENTORY } from './agentic-catalog-records.ts';
import type { CanonicalRegistryRecord, RegistryVerification } from './agentic-registry.ts';

export const ROLE_MANIFEST_API_VERSION = 'agenticroles.dev/v1alpha1' as const;
export const SKILL_MANIFEST_FORMAT = 'agent-skills-compatible/v1' as const;

type ManifestStatus = 'draft' | 'stable' | 'deprecated';
type Criticality = 'required' | 'optional';
type AutonomyLevel = 'unspecified' | 'bounded' | 'supervised' | 'human-gated';
type RiskClass = 'low' | 'medium' | 'high' | 'critical' | null;

export interface ManifestSource {
  ref: string;
  verification: RegistryVerification;
}

export interface ManifestMetadata {
  id: string;
  catalogId: string;
  name: string;
  version: string;
  status: ManifestStatus;
  description: string;
  aliases: string[];
  license: string | null;
}

export interface TypedArtifactRef {
  id: string;
  type: string;
  required: boolean;
}

export interface TypedOutputRef extends TypedArtifactRef {
  qualityGates: string[];
}

export interface ResponsibilitySpec {
  id: string;
  statement: string;
  criticality: Criticality;
}

export interface SkillCapabilityRef {
  ref: string;
  required: boolean;
}

export interface ToolCapabilityRef {
  ref: string;
  required: boolean;
  permissions: string[];
}

export interface ApprovalRequirement {
  action: string;
  approverRole: string;
}

export interface DelegationPolicy {
  permitted: boolean;
  propagatesPermissions: boolean;
  maximumDepth: number;
}

export interface HandoffSpec {
  to: string;
  when: string;
  requires: string[];
  recipientMustVerify: string[];
  onReject: string;
  onPolicyViolation: string;
}

export interface VerificationAssertion {
  id: string;
  type: 'deterministic' | 'schema' | 'policy' | 'human-review';
  expression: string;
}

export interface RoleManifest {
  apiVersion: typeof ROLE_MANIFEST_API_VERSION;
  kind: 'RoleType';
  metadata: ManifestMetadata;
  source: ManifestSource;
  taxonomy: {
    industry: string[];
    domains: string[];
    functions: string[];
    externalMappings: Array<{ scheme: string; relation: string; value: string }>;
  };
  mission: {
    statement: string | null;
    outcomes: string[];
  };
  responsibilities: ResponsibilitySpec[];
  inputs: TypedArtifactRef[];
  outputs: TypedOutputRef[];
  capabilities: {
    skills: SkillCapabilityRef[];
    tools: ToolCapabilityRef[];
  };
  authority: {
    autonomyLevel: AutonomyLevel;
    may: string[];
    mustNot: string[];
    approvalsRequired: ApprovalRequirement[];
    delegation: DelegationPolicy | null;
  };
  constraints: Array<{ id: string; rule: string }>;
  dependencies: {
    requiresRoles: string[];
  };
  handoffs: {
    receives: HandoffSpec[];
    sends: HandoffSpec[];
  };
  escalation: {
    triggers: Array<{ condition: string; target: string }>;
  };
  verification: {
    assertions: VerificationAssertion[];
    evalSuites: string[];
    minimumScores: Record<string, number>;
  };
  kpis: Array<{ id: string; direction: 'minimize' | 'maximize' | 'target'; measurement: string }>;
  operatingContract: {
    concurrency: number | null;
    retryPolicy: { maxAttempts: number; retryable: string[] } | null;
    completion: { requires: string[] };
    memory: { allowed: string[]; prohibited: string[] };
  };
  governance: {
    owner: string | null;
    riskClass: RiskClass;
    reviewCadence: string | null;
    controls: Array<{ framework: string; refs: string[] }>;
  };
  interoperability: {
    agentSkillsCompatible: true;
    a2a: { publishAgentCard: boolean; exposeSkills: string[] };
    runtimeAdapters: string[];
  };
  provenance: {
    publisher: string | null;
    sourceRevision: string | null;
    artifactDigest: string | null;
    signed: boolean;
  };
  telemetry: {
    convention: 'opentelemetry';
    requiredEvents: string[];
  };
}

export interface SkillManifest {
  format: typeof SKILL_MANIFEST_FORMAT;
  kind: 'Skill';
  metadata: ManifestMetadata;
  source: ManifestSource;
  compatibility: {
    standard: 'Agent Skills';
    skillMdCompatible: true;
    allowedTools: string[];
  };
  activation: {
    shouldTrigger: string[];
    shouldNotTrigger: string[];
  };
  inputs: TypedArtifactRef[];
  outputs: TypedArtifactRef[];
  boundaries: {
    allowed: string[];
    prohibited: string[];
    escalationConditions: string[];
  };
  evaluation: {
    fixtures: string[];
    expectedBehavior: string[];
    regressionThresholds: Record<string, number>;
  };
  provenance: {
    publisher: string | null;
    sourceRevision: string | null;
    artifactDigest: string | null;
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ManifestReadinessResult {
  ready: boolean;
  gaps: string[];
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ROLE_ID_PATTERN = /^role:\/\/[a-z0-9][a-z0-9._/-]*$/;
const SKILL_ID_PATTERN = /^skill:\/\/[a-z0-9][a-z0-9._/-]*$/;
const ARTIFACT_TYPE_PATTERN = /^artifact:\/\/[a-z0-9][a-z0-9._/-]*$/;

function starterSource(record: CanonicalRegistryRecord): ManifestSource {
  return {
    ref: record.canonicalRef ?? record.evidence[0]?.sourceRef ?? '',
    verification: record.verification,
  };
}

function starterMetadata(record: CanonicalRegistryRecord, prefix: 'role' | 'skill', namespace: string): ManifestMetadata {
  const catalogId = String(record.metadata?.catalogId ?? '').trim();
  return {
    id: `${prefix}://${namespace}/${catalogId.toLowerCase()}`,
    catalogId,
    name: record.name,
    version: '0.1.0',
    status: 'draft',
    description: record.description,
    aliases: [],
    license: null,
  };
}

export function roleRecordToStarterManifest(record: CanonicalRegistryRecord): RoleManifest {
  if (record.kind !== 'agent') throw new Error(`ROLE_RECORD_REQUIRED: ${record.id}`);
  return {
    apiVersion: ROLE_MANIFEST_API_VERSION,
    kind: 'RoleType',
    metadata: starterMetadata(record, 'role', 'agentic-role-library'),
    source: starterSource(record),
    taxonomy: { industry: [], domains: [], functions: [], externalMappings: [] },
    mission: { statement: null, outcomes: [] },
    responsibilities: [],
    inputs: [],
    outputs: [],
    capabilities: { skills: [], tools: [] },
    authority: { autonomyLevel: 'unspecified', may: [], mustNot: [], approvalsRequired: [], delegation: null },
    constraints: [],
    dependencies: { requiresRoles: [] },
    handoffs: { receives: [], sends: [] },
    escalation: { triggers: [] },
    verification: { assertions: [], evalSuites: [], minimumScores: {} },
    kpis: [],
    operatingContract: {
      concurrency: null,
      retryPolicy: null,
      completion: { requires: [] },
      memory: { allowed: [], prohibited: [] },
    },
    governance: { owner: null, riskClass: null, reviewCadence: null, controls: [] },
    interoperability: {
      agentSkillsCompatible: true,
      a2a: { publishAgentCard: false, exposeSkills: [] },
      runtimeAdapters: [],
    },
    provenance: { publisher: null, sourceRevision: null, artifactDigest: null, signed: false },
    telemetry: {
      convention: 'opentelemetry',
      requiredEvents: ['assignment.received', 'tool.invoked', 'handoff.created', 'policy.decision', 'artifact.produced', 'verification.completed'],
    },
  };
}

export function skillRecordToStarterManifest(record: CanonicalRegistryRecord): SkillManifest {
  if (record.kind !== 'skill') throw new Error(`SKILL_RECORD_REQUIRED: ${record.id}`);
  return {
    format: SKILL_MANIFEST_FORMAT,
    kind: 'Skill',
    metadata: starterMetadata(record, 'skill', 'agentic-skill-library'),
    source: starterSource(record),
    compatibility: { standard: 'Agent Skills', skillMdCompatible: true, allowedTools: [] },
    activation: { shouldTrigger: [], shouldNotTrigger: [] },
    inputs: [],
    outputs: [],
    boundaries: { allowed: [], prohibited: [], escalationConditions: [] },
    evaluation: { fixtures: [], expectedBehavior: [], regressionThresholds: {} },
    provenance: { publisher: null, sourceRevision: null, artifactDigest: null },
  };
}

function validateMetadata(metadata: ManifestMetadata, idPattern: RegExp, idLabel: string): string[] {
  const errors: string[] = [];
  if (!idPattern.test(metadata.id)) errors.push(`metadata.id must be a stable ${idLabel} URI`);
  if (!metadata.catalogId.trim()) errors.push('metadata.catalogId is required');
  if (!metadata.name.trim()) errors.push('metadata.name is required');
  if (!SEMVER_PATTERN.test(metadata.version)) errors.push('metadata.version must be semantic version');
  return errors;
}

function validateTypedArtifacts(items: TypedArtifactRef[], label: string): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.trim()) errors.push(`${label} item id is required`);
    if (ids.has(item.id)) errors.push(`${label} duplicate item id: ${item.id}`);
    ids.add(item.id);
    if (!ARTIFACT_TYPE_PATTERN.test(item.type)) errors.push(`${label} ${item.id} must use artifact:// type`);
  }
  return errors;
}

export function validateRoleManifest(manifest: RoleManifest): ManifestValidationResult {
  const errors = validateMetadata(manifest.metadata, ROLE_ID_PATTERN, 'role://');
  if (manifest.apiVersion !== ROLE_MANIFEST_API_VERSION) errors.push(`apiVersion must be ${ROLE_MANIFEST_API_VERSION}`);
  if (manifest.kind !== 'RoleType') errors.push('kind must be RoleType');
  if (!manifest.source.ref.trim()) errors.push('source.ref is required');
  errors.push(...validateTypedArtifacts(manifest.inputs, 'inputs'));
  errors.push(...validateTypedArtifacts(manifest.outputs, 'outputs'));
  for (const capability of manifest.capabilities.skills) {
    if (!SKILL_ID_PATTERN.test(capability.ref)) errors.push(`skill capability must use skill:// URI: ${capability.ref}`);
  }
  if (manifest.authority.delegation && manifest.authority.delegation.maximumDepth < 0) {
    errors.push('authority.delegation.maximumDepth must be nonnegative');
  }
  for (const [name, value] of Object.entries(manifest.verification.minimumScores)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`verification.minimumScores.${name} must be within 0..1`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateSkillManifest(manifest: SkillManifest): ManifestValidationResult {
  const errors = validateMetadata(manifest.metadata, SKILL_ID_PATTERN, 'skill://');
  if (manifest.format !== SKILL_MANIFEST_FORMAT) errors.push(`format must be ${SKILL_MANIFEST_FORMAT}`);
  if (manifest.kind !== 'Skill') errors.push('kind must be Skill');
  if (!manifest.source.ref.trim()) errors.push('source.ref is required');
  if (manifest.compatibility.standard !== 'Agent Skills' || manifest.compatibility.skillMdCompatible !== true) {
    errors.push('skill manifest must remain Agent Skills compatible');
  }
  errors.push(...validateTypedArtifacts(manifest.inputs, 'inputs'));
  errors.push(...validateTypedArtifacts(manifest.outputs, 'outputs'));
  for (const [name, value] of Object.entries(manifest.evaluation.regressionThresholds)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`evaluation.regressionThresholds.${name} must be within 0..1`);
  }
  return { valid: errors.length === 0, errors };
}

export function assessRoleManifestReadiness(manifest: RoleManifest): ManifestReadinessResult {
  const gaps = [...validateRoleManifest(manifest).errors];
  if (!manifest.mission.statement?.trim()) gaps.push('mission.statement');
  if (manifest.responsibilities.length === 0) gaps.push('responsibilities');
  if (manifest.inputs.length === 0) gaps.push('typed inputs');
  if (manifest.outputs.length === 0) gaps.push('typed outputs');
  if (manifest.capabilities.skills.length + manifest.capabilities.tools.length === 0) gaps.push('capabilities');
  if (manifest.authority.autonomyLevel === 'unspecified') gaps.push('authority.autonomyLevel');
  if (manifest.authority.may.length === 0) gaps.push('authority.may');
  if (manifest.authority.mustNot.length === 0) gaps.push('authority.mustNot');
  if (!manifest.authority.delegation) gaps.push('authority.delegation');
  if (manifest.handoffs.receives.length + manifest.handoffs.sends.length === 0) gaps.push('handoff contract');
  if (manifest.verification.assertions.length === 0) gaps.push('verification.assertions');
  if (manifest.verification.evalSuites.length === 0) gaps.push('verification.evalSuites');
  if (!manifest.governance.owner?.trim()) gaps.push('governance.owner');
  if (!manifest.governance.riskClass) gaps.push('governance.riskClass');
  if (!manifest.provenance.publisher?.trim()) gaps.push('provenance.publisher');
  if (!manifest.provenance.sourceRevision?.trim()) gaps.push('provenance.sourceRevision');
  if (!manifest.provenance.artifactDigest?.trim()) gaps.push('provenance.artifactDigest');
  return { ready: gaps.length === 0, gaps };
}

export function assessSkillManifestReadiness(manifest: SkillManifest): ManifestReadinessResult {
  const gaps = [...validateSkillManifest(manifest).errors];
  if (manifest.activation.shouldTrigger.length === 0) gaps.push('activation.shouldTrigger');
  if (manifest.activation.shouldNotTrigger.length === 0) gaps.push('activation.shouldNotTrigger');
  if (manifest.inputs.length === 0) gaps.push('typed inputs');
  if (manifest.outputs.length === 0) gaps.push('typed outputs');
  if (manifest.evaluation.fixtures.length === 0) gaps.push('evaluation.fixtures');
  if (manifest.evaluation.expectedBehavior.length === 0) gaps.push('evaluation.expectedBehavior');
  if (!manifest.provenance.publisher?.trim()) gaps.push('provenance.publisher');
  if (!manifest.provenance.sourceRevision?.trim()) gaps.push('provenance.sourceRevision');
  if (!manifest.provenance.artifactDigest?.trim()) gaps.push('provenance.artifactDigest');
  return { ready: gaps.length === 0, gaps };
}

export const UNIVERSAL_ROLE_MANIFESTS: RoleManifest[] = AGENT_ROLE_INVENTORY.map(roleRecordToStarterManifest);
export const UNIVERSAL_SKILL_MANIFESTS: SkillManifest[] = AGENT_SKILL_INVENTORY.map(skillRecordToStarterManifest);
