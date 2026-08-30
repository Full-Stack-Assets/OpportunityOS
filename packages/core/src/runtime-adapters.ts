import { CANONICAL_ARCHITECTURE_INVENTORY } from './canonical-architecture-inventory.ts';
import { validateRoleManifest, type RoleManifest } from './agentic-manifests.ts';
import type { RegistryHealth, RegistryLifecycle, RegistryVerification } from './agentic-registry.ts';

export type RuntimeAdapterId =
  | 'chatgpt'
  | 'codex'
  | 'cursor'
  | 'grok'
  | 'manus'
  | 'claude-code'
  | 'github-actions';

export interface RuntimeAdapter {
  id: RuntimeAdapterId;
  runtimeRegistryId: string;
  name: string;
  lifecycle: RegistryLifecycle;
  verification: RegistryVerification;
  health: RegistryHealth;
  transport: {
    kind: string;
  };
  capabilities: string[];
  supportedRoleFields: string[];
  guardrails: {
    failClosed: true;
    credentialsInPayload: false;
    authorityEscalationRequired: true;
  };
  observability: {
    traceRequired: true;
    convention: 'opentelemetry';
  };
  projectionFormat: string;
}

export interface RuntimeAdapterReadiness {
  ready: boolean;
  gaps: string[];
}

export interface RuntimeRoleProjection {
  sourceRoleId: string;
  sourceRoleVersion: string;
  runtimeAdapterId: RuntimeAdapterId;
  runtimeRegistryId: string;
  format: string;
  instructions: string;
  skills: string[];
  tools: Array<{ ref: string; permissions: string[] }>;
  handoffs: {
    receives: Array<{ from: string; when: string }>;
    sends: Array<{ to: string; when: string }>;
  };
  authority: {
    autonomyLevel: RoleManifest['authority']['autonomyLevel'];
    may: string[];
    mustNot: string[];
    approvalsRequired: Array<{ action: string; approverRole: string }>;
  };
  outputTypes: string[];
  telemetryEvents: string[];
}

const TARGETS: Array<{
  id: RuntimeAdapterId;
  runtimeRegistryId: string;
  transport: string;
  projectionFormat: string;
}> = [
  { id: 'chatgpt', runtimeRegistryId: 'runtime.chatgpt', transport: 'chatgpt-tool-runtime', projectionFormat: 'chatgpt-role-projection/v1' },
  { id: 'codex', runtimeRegistryId: 'runtime.codex', transport: 'codex-agent-runtime', projectionFormat: 'codex-role-projection/v1' },
  { id: 'cursor', runtimeRegistryId: 'runtime.cursor', transport: 'cursor-agent-runtime', projectionFormat: 'cursor-role-projection/v1' },
  { id: 'grok', runtimeRegistryId: 'runtime.grok', transport: 'grok-agent-runtime', projectionFormat: 'grok-role-projection/v1' },
  { id: 'manus', runtimeRegistryId: 'runtime.manus', transport: 'manus-agent-runtime', projectionFormat: 'manus-role-projection/v1' },
  { id: 'claude-code', runtimeRegistryId: 'runtime.claude-code', transport: 'claude-code-runtime', projectionFormat: 'claude-code-role-projection/v1' },
  { id: 'github-actions', runtimeRegistryId: 'runtime.github-actions', transport: 'github-actions-runtime', projectionFormat: 'github-agent-role-projection/v1' },
];

const SUPPORTED_ROLE_FIELDS = [
  'metadata',
  'mission',
  'responsibilities',
  'inputs',
  'outputs',
  'capabilities.skills',
  'capabilities.tools',
  'authority',
  'constraints',
  'handoffs',
  'verification',
  'governance',
  'provenance',
  'telemetry',
];

function runtimeRecord(id: string) {
  return CANONICAL_ARCHITECTURE_INVENTORY.find((record) => record.id === id && record.kind === 'runtime');
}

export const RUNTIME_ADAPTERS: RuntimeAdapter[] = TARGETS.map((target) => {
  const record = runtimeRecord(target.runtimeRegistryId);
  if (!record) throw new Error(`MISSING_RUNTIME_REGISTRY_RECORD: ${target.runtimeRegistryId}`);
  return {
    id: target.id,
    runtimeRegistryId: target.runtimeRegistryId,
    name: record.name,
    lifecycle: record.lifecycle,
    verification: record.verification,
    health: record.health,
    transport: { kind: target.transport },
    capabilities: [...(record.capabilities ?? [])],
    supportedRoleFields: [...SUPPORTED_ROLE_FIELDS],
    guardrails: {
      failClosed: true,
      credentialsInPayload: false,
      authorityEscalationRequired: true,
    },
    observability: {
      traceRequired: true,
      convention: 'opentelemetry',
    },
    projectionFormat: target.projectionFormat,
  };
});

export function getRuntimeAdapter(id: string): RuntimeAdapter {
  const adapter = RUNTIME_ADAPTERS.find((item) => item.id === id);
  if (!adapter) throw new Error(`UNKNOWN_RUNTIME_ADAPTER: ${id}`);
  return adapter;
}

export function assessRuntimeAdapterReadiness(adapter: RuntimeAdapter): RuntimeAdapterReadiness {
  const gaps: string[] = [];
  if (adapter.lifecycle !== 'active') gaps.push('runtime lifecycle is not active');
  if (adapter.verification !== 'VERIFIED') gaps.push('runtime verification is not VERIFIED');
  if (adapter.health !== 'HEALTHY') gaps.push('runtime health is not HEALTHY');
  if (!adapter.transport.kind.trim()) gaps.push('runtime transport is missing');
  if (adapter.capabilities.length === 0) gaps.push('runtime capabilities are missing');
  if (adapter.guardrails.failClosed !== true) gaps.push('runtime must fail closed');
  if (adapter.guardrails.credentialsInPayload !== false) gaps.push('credentials must not enter runtime payloads');
  if (adapter.observability.traceRequired !== true) gaps.push('runtime tracing is required');
  return { ready: gaps.length === 0, gaps };
}

function buildInstructions(role: RoleManifest): string {
  const sections: string[] = [];
  if (role.mission.statement?.trim()) sections.push(`Mission: ${role.mission.statement.trim()}`);
  if (role.responsibilities.length > 0) {
    sections.push(`Responsibilities:\n${role.responsibilities.map((item) => `- ${item.statement}`).join('\n')}`);
  }
  if (role.constraints.length > 0) {
    sections.push(`Constraints:\n${role.constraints.map((item) => `- ${item.rule}`).join('\n')}`);
  }
  if (role.authority.mustNot.length > 0) {
    sections.push(`Prohibited actions:\n${role.authority.mustNot.map((item) => `- ${item}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

export function projectRoleManifestToRuntime(role: RoleManifest, adapterId: string): RuntimeRoleProjection {
  const adapter = getRuntimeAdapter(adapterId);
  const validation = validateRoleManifest(role);
  if (!validation.valid) throw new Error(`INVALID_ROLE_MANIFEST: ${validation.errors.join('; ')}`);

  return {
    sourceRoleId: role.metadata.id,
    sourceRoleVersion: role.metadata.version,
    runtimeAdapterId: adapter.id,
    runtimeRegistryId: adapter.runtimeRegistryId,
    format: adapter.projectionFormat,
    instructions: buildInstructions(role),
    skills: role.capabilities.skills.map((skill) => skill.ref),
    tools: role.capabilities.tools.map((tool) => ({ ref: tool.ref, permissions: [...tool.permissions] })),
    handoffs: {
      receives: role.handoffs.receives.map((handoff) => ({ from: handoff.to, when: handoff.when })),
      sends: role.handoffs.sends.map((handoff) => ({ to: handoff.to, when: handoff.when })),
    },
    authority: {
      autonomyLevel: role.authority.autonomyLevel,
      may: [...role.authority.may],
      mustNot: [...role.authority.mustNot],
      approvalsRequired: role.authority.approvalsRequired.map((approval) => ({ ...approval })),
    },
    outputTypes: role.outputs.map((output) => output.type),
    telemetryEvents: [...role.telemetry.requiredEvents],
  };
}
