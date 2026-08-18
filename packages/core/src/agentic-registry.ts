import { hashCanonical } from './canonical.ts';

export type RegistryKind =
  | 'project'
  | 'repository'
  | 'agent'
  | 'skill'
  | 'catalog'
  | 'integration'
  | 'runtime'
  | 'automation';

export type RegistryLifecycle = 'active' | 'planned' | 'paused' | 'archived';
export type RegistryVerification = 'VERIFIED' | 'PARTIAL' | 'DECLARED' | 'UNKNOWN';
export type RegistryHealth = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN' | 'NOT_APPLICABLE';
export type RegistryDataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export interface RegistryEvidence {
  sourceType: 'github' | 'library' | 'automation' | 'system' | 'user-context';
  sourceRef: string;
  observedAt: string;
  verified: boolean;
}

export interface RegistryRelationship {
  type:
    | 'contains'
    | 'depends_on'
    | 'implements'
    | 'uses'
    | 'provides'
    | 'tracks'
    | 'executes_on'
    | 'source_for';
  targetId: string;
}

export type RegistryMetadataValue = string | number | boolean | string[];

export interface CanonicalRegistryRecord {
  id: string;
  kind: RegistryKind;
  name: string;
  lifecycle: RegistryLifecycle;
  verification: RegistryVerification;
  health: RegistryHealth;
  dataClassification: RegistryDataClassification;
  description: string;
  canonicalRef?: string;
  capabilities?: string[];
  relationships?: RegistryRelationship[];
  metadata?: Record<string, RegistryMetadataValue>;
  evidence: RegistryEvidence[];
}

export interface CanonicalRegistrySnapshot {
  schemaVersion: 'agentic-registry/v1';
  generatedAt: string;
  recordCount: number;
  countsByKind: Record<RegistryKind, number>;
  records: CanonicalRegistryRecord[];
  payloadHash: string;
}

export interface RegistryValidationResult {
  valid: boolean;
  errors: string[];
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const SECRET_KEY_PATTERN = /(secret|password|credential|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;
const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

function containsSecretMaterial(record: CanonicalRegistryRecord): boolean {
  for (const [key, value] of Object.entries(record.metadata ?? {})) {
    if (SECRET_KEY_PATTERN.test(key)) return true;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item !== 'string') continue;
      if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(item))) return true;
    }
  }
  return false;
}

export function validateCanonicalRegistry(records: CanonicalRegistryRecord[]): RegistryValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const record of records) {
    if (!ID_PATTERN.test(record.id)) errors.push(`invalid registry id: ${record.id}`);
    if (ids.has(record.id)) errors.push(`duplicate registry id: ${record.id}`);
    ids.add(record.id);

    if (record.evidence.length === 0) errors.push(`record has no evidence: ${record.id}`);
    if (record.evidence.some((item) => !item.sourceRef.trim() || !item.observedAt.trim())) {
      errors.push(`record has malformed evidence: ${record.id}`);
    }
    if (record.verification === 'VERIFIED' && !record.evidence.some((item) => item.verified)) {
      errors.push(`verified record lacks verified evidence: ${record.id}`);
    }
    if (record.health === 'HEALTHY' && !record.evidence.some((item) => item.verified)) {
      errors.push(`healthy record lacks verified evidence: ${record.id}`);
    }
    if (containsSecretMaterial(record)) errors.push(`record contains secret-like metadata: ${record.id}`);
  }

  for (const record of records) {
    for (const relationship of record.relationships ?? []) {
      if (!ids.has(relationship.targetId)) {
        errors.push(`missing relationship target ${relationship.targetId} from ${record.id}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function countsByKind(records: CanonicalRegistryRecord[]): Record<RegistryKind, number> {
  const counts: Record<RegistryKind, number> = {
    project: 0,
    repository: 0,
    agent: 0,
    skill: 0,
    catalog: 0,
    integration: 0,
    runtime: 0,
    automation: 0,
  };
  for (const record of records) counts[record.kind] += 1;
  return counts;
}

export function buildCanonicalRegistrySnapshot(
  records: CanonicalRegistryRecord[],
  generatedAt: string,
): CanonicalRegistrySnapshot {
  const validation = validateCanonicalRegistry(records);
  if (!validation.valid) throw new Error(`INVALID_CANONICAL_REGISTRY: ${validation.errors.join('; ')}`);

  const canonicalRecords: CanonicalRegistryRecord[] = [...records]
    .map((record): CanonicalRegistryRecord => ({
      ...record,
      ...(record.capabilities ? { capabilities: [...record.capabilities].sort() } : {}),
      ...(record.relationships
        ? { relationships: [...record.relationships].sort((a, b) => `${a.type}:${a.targetId}`.localeCompare(`${b.type}:${b.targetId}`)) }
        : {}),
      evidence: [...record.evidence].sort((a, b) => `${a.sourceType}:${a.sourceRef}`.localeCompare(`${b.sourceType}:${b.sourceRef}`)),
    }))
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));

  const base = {
    schemaVersion: 'agentic-registry/v1' as const,
    generatedAt,
    recordCount: canonicalRecords.length,
    countsByKind: countsByKind(canonicalRecords),
    records: canonicalRecords,
  };

  return { ...base, payloadHash: hashCanonical(base) };
}

export function getRegistryRecord(
  records: CanonicalRegistryRecord[],
  id: string,
): CanonicalRegistryRecord | undefined {
  return records.find((record) => record.id === id);
}

export function listRegistryRecords(
  records: CanonicalRegistryRecord[],
  kind: RegistryKind,
): CanonicalRegistryRecord[] {
  return records.filter((record) => record.kind === kind);
}
