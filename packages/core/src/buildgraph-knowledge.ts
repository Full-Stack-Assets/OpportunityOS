import { hashCanonical } from './canonical.ts';

export type KnowledgeEntityKind =
  | 'project'
  | 'product'
  | 'repository'
  | 'document'
  | 'research'
  | 'report'
  | 'conversation'
  | 'message'
  | 'person'
  | 'company'
  | 'opportunity'
  | 'decision'
  | 'requirement'
  | 'constraint'
  | 'capability'
  | 'component'
  | 'skill'
  | 'agent'
  | 'automation'
  | 'integration'
  | 'dataset'
  | 'deployment'
  | 'issue'
  | 'pull_request'
  | 'commit'
  | 'artifact'
  | 'source'
  | 'evidence';

export type KnowledgeEntityStatus = 'active' | 'archived' | 'superseded' | 'draft';

export type KnowledgeSourceSystem =
  | 'github'
  | 'google-drive'
  | 'gmail'
  | 'chat-history'
  | 'uploaded-file'
  | 'wisebase'
  | 'external';

export type KnowledgeDisposition =
  | 'LINK'
  | 'MERGE'
  | 'UPDATE'
  | 'SUPERSEDE'
  | 'ARCHIVE'
  | 'CREATE_ENTITY'
  | 'REVIEW';

export type KnowledgeRelationshipType =
  | 'BELONGS_TO'
  | 'IMPLEMENTS'
  | 'DEPENDS_ON'
  | 'SUPERSEDES'
  | 'DUPLICATES'
  | 'REUSES'
  | 'DERIVED_FROM'
  | 'DISCUSSED_IN'
  | 'SUPPORTED_BY'
  | 'DEPLOYED_TO'
  | 'GENERATED_BY'
  | 'RELATED_TO'
  | 'BLOCKED_BY'
  | 'OWNED_BY'
  | 'CREATED_FOR';

export interface KnowledgeSourceRef {
  system: KnowledgeSourceSystem;
  sourceNativeId: string;
  url?: string;
}

export interface CanonicalKnowledgeEntity {
  id: string;
  kind: KnowledgeEntityKind;
  canonicalName: string;
  normalizedName: string;
  aliases: string[];
  normalizedAliases: string[];
  status: KnowledgeEntityStatus;
  sourceRefs: KnowledgeSourceRef[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  provenanceHash: string;
}

export interface CreateCanonicalEntityInput {
  kind: KnowledgeEntityKind;
  canonicalName: string;
  aliases?: string[];
  status: KnowledgeEntityStatus;
  sourceRefs?: KnowledgeSourceRef[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeSourceRecord {
  id: string;
  system: KnowledgeSourceSystem;
  sourceNativeId?: string;
  title: string;
  normalizedTitle: string;
  url?: string;
  observedAt: string;
  contentHash?: string;
  metadata: Record<string, unknown>;
  projectHints: string[];
  provenanceHash: string;
}

export interface CreateSourceRecordInput {
  system: KnowledgeSourceSystem;
  sourceNativeId?: string;
  title: string;
  url?: string;
  observedAt: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  projectHints?: string[];
}

export interface KnowledgeRelationshipCandidate {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: KnowledgeRelationshipType;
  confidence: number;
  evidence: KnowledgeSourceRef[];
  provenanceHash: string;
}

export interface KnowledgeMatchCandidate {
  entityId: string;
  score: number;
  reasons: string[];
  exactSourceMatch: boolean;
  normalizedNameMatch: boolean;
  status: KnowledgeEntityStatus;
}

export interface KnowledgeResolution {
  sourceId: string;
  candidates: KnowledgeMatchCandidate[];
  bestMatch?: KnowledgeMatchCandidate;
  ambiguous: boolean;
  confidence: number;
}

export interface GitHubRepositorySnapshot {
  id: string;
  name: string;
  fullName: string;
  url: string;
  visibility: string;
  defaultBranch: string;
  size: number;
  archived: boolean;
  searchIndexed?: boolean;
  observedAt: string;
}

export interface GitHubKnowledgeIngestion {
  source: KnowledgeSourceRecord;
  repository: CanonicalKnowledgeEntity;
  project: CanonicalKnowledgeEntity;
  relationship: KnowledgeRelationshipCandidate;
}

const REPOSITORY_SUFFIXES = new Set([
  'app', 'cc', 'com', 'dev', 'io', 'net', 'online', 'org', 'site', 'space',
]);

function assertIsoTimestamp(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid ISO timestamp`);
  }
}

function splitEntityTokens(value: string): string[] {
  const spacedCamelCase = value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');

  const tokens = spacedCamelCase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length > 1 && REPOSITORY_SUFFIXES.has(tokens[tokens.length - 1] ?? '')) {
    tokens.pop();
  }
  return tokens;
}

export function normalizeEntityName(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Entity name must be a string');
  return splitEntityTokens(value).join('');
}

function displayEntityName(value: string): string {
  const trimmed = value.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.]+$/g, '');
  const suffixMatch = trimmed.match(/^(.*)\.([a-zA-Z]{2,12})$/);
  if (suffixMatch && REPOSITORY_SUFFIXES.has((suffixMatch[2] ?? '').toLowerCase())) {
    return (suffixMatch[1] ?? trimmed).replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  }
  return trimmed;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createCanonicalEntity(input: CreateCanonicalEntityInput): CanonicalKnowledgeEntity {
  assertIsoTimestamp(input.createdAt, 'createdAt');
  assertIsoTimestamp(input.updatedAt, 'updatedAt');
  const canonicalName = input.canonicalName.trim();
  const normalizedName = normalizeEntityName(canonicalName);
  if (!normalizedName) throw new TypeError('canonicalName must contain alphanumeric characters');

  const aliases = uniqueStrings(input.aliases ?? []);
  const normalizedAliases = uniqueStrings(aliases.map(normalizeEntityName)).filter((alias) => alias !== normalizedName);
  const sourceRefs = (input.sourceRefs ?? []).map((ref) => ({
    system: ref.system,
    sourceNativeId: ref.sourceNativeId,
    ...(ref.url ? { url: ref.url } : {}),
  }));
  const tags = uniqueStrings(input.tags ?? []);
  const identitySeed = sourceRefs[0]
    ? { kind: input.kind, system: sourceRefs[0].system, sourceNativeId: sourceRefs[0].sourceNativeId }
    : { kind: input.kind, normalizedName };
  const id = `knowledge:${input.kind}:${hashCanonical(identitySeed).slice(0, 20)}`;

  const payload = {
    id,
    kind: input.kind,
    canonicalName,
    normalizedName,
    aliases,
    normalizedAliases,
    status: input.status,
    sourceRefs,
    tags,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  return {
    ...payload,
    provenanceHash: hashCanonical(payload),
  };
}

export function createSourceRecord(input: CreateSourceRecordInput): KnowledgeSourceRecord {
  assertIsoTimestamp(input.observedAt, 'observedAt');
  const title = input.title.trim();
  const normalizedTitle = normalizeEntityName(title);
  if (!normalizedTitle) throw new TypeError('title must contain alphanumeric characters');

  const identitySeed = input.sourceNativeId
    ? { system: input.system, sourceNativeId: input.sourceNativeId }
    : { system: input.system, title: normalizedTitle, url: input.url ?? '' };
  const id = `source:${input.system}:${hashCanonical(identitySeed).slice(0, 20)}`;
  const payload = {
    id,
    system: input.system,
    ...(input.sourceNativeId ? { sourceNativeId: input.sourceNativeId } : {}),
    title,
    normalizedTitle,
    ...(input.url ? { url: input.url } : {}),
    observedAt: input.observedAt,
    ...(input.contentHash ? { contentHash: input.contentHash } : {}),
    metadata: input.metadata ?? {},
    projectHints: uniqueStrings(input.projectHints ?? []),
  };

  return {
    ...payload,
    provenanceHash: hashCanonical(payload),
  };
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const leftPairs = bigrams(left);
  const rightCounts = new Map<string, number>();
  for (const pair of bigrams(right)) rightCounts.set(pair, (rightCounts.get(pair) ?? 0) + 1);
  let overlap = 0;
  for (const pair of leftPairs) {
    const available = rightCounts.get(pair) ?? 0;
    if (available > 0) {
      overlap += 1;
      rightCounts.set(pair, available - 1);
    }
  }
  return (2 * overlap) / (leftPairs.length + bigrams(right).length);
}

function sourceMatchesEntity(source: KnowledgeSourceRecord, entity: CanonicalKnowledgeEntity): boolean {
  if (!source.sourceNativeId) return false;
  return entity.sourceRefs.some(
    (ref) => ref.system === source.system && ref.sourceNativeId === source.sourceNativeId,
  );
}

function scoreEntity(source: KnowledgeSourceRecord, entity: CanonicalKnowledgeEntity): KnowledgeMatchCandidate {
  const reasons: string[] = [];
  const exactSourceMatch = sourceMatchesEntity(source, entity);
  const normalizedNameMatch = source.normalizedTitle === entity.normalizedName
    || entity.normalizedAliases.includes(source.normalizedTitle);

  let score = 0;
  if (exactSourceMatch) {
    score = 1;
    reasons.push('exact-source-identity');
  } else if (normalizedNameMatch) {
    score = 0.92;
    reasons.push(source.normalizedTitle === entity.normalizedName ? 'exact-normalized-name' : 'exact-normalized-alias');
  } else {
    const similarities = [entity.normalizedName, ...entity.normalizedAliases]
      .map((candidate) => diceSimilarity(source.normalizedTitle, candidate));
    const similarity = Math.max(0, ...similarities);
    score = Number((similarity * 0.8).toFixed(6));
    if (similarity > 0) reasons.push(`name-similarity:${similarity.toFixed(4)}`);
  }

  if (entity.status === 'archived' && !exactSourceMatch) {
    score = Number((score * 0.9).toFixed(6));
    reasons.push('archived-downrank');
  }

  return {
    entityId: entity.id,
    score,
    reasons,
    exactSourceMatch,
    normalizedNameMatch,
    status: entity.status,
  };
}

export function resolveKnowledgeItem(
  source: KnowledgeSourceRecord,
  entities: CanonicalKnowledgeEntity[],
): KnowledgeResolution {
  const candidates = entities
    .map((entity) => scoreEntity(source, entity))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.entityId.localeCompare(right.entityId));

  const bestMatch = candidates[0];
  const secondMatch = candidates[1];
  const ambiguous = Boolean(
    bestMatch
      && secondMatch
      && bestMatch.score >= 0.82
      && secondMatch.score >= 0.82
      && (bestMatch.normalizedNameMatch && secondMatch.normalizedNameMatch
        || Math.abs(bestMatch.score - secondMatch.score) <= 0.03),
  );

  return {
    sourceId: source.id,
    candidates,
    ...(bestMatch ? { bestMatch } : {}),
    ambiguous,
    confidence: bestMatch?.score ?? 0,
  };
}

export function classifyKnowledgeDisposition(
  _source: KnowledgeSourceRecord,
  resolution: KnowledgeResolution,
): KnowledgeDisposition {
  if (resolution.ambiguous) return 'REVIEW';
  const best = resolution.bestMatch;
  if (!best || best.score < 0.65) return 'CREATE_ENTITY';
  if (best.exactSourceMatch) return 'UPDATE';
  if (best.normalizedNameMatch) return 'LINK';
  if (best.score >= 0.8) return 'REVIEW';
  return 'CREATE_ENTITY';
}

function createRelationship(
  sourceEntityId: string,
  targetEntityId: string,
  type: KnowledgeRelationshipType,
  evidence: KnowledgeSourceRef[],
  confidence = 1,
): KnowledgeRelationshipCandidate {
  const payload = { sourceEntityId, targetEntityId, type, confidence, evidence };
  return {
    id: `relationship:${hashCanonical(payload).slice(0, 20)}`,
    ...payload,
    provenanceHash: hashCanonical(payload),
  };
}

export function ingestGitHubRepository(repo: GitHubRepositorySnapshot): GitHubKnowledgeIngestion {
  assertIsoTimestamp(repo.observedAt, 'observedAt');
  if (!repo.id.trim()) throw new TypeError('GitHub repository id is required');
  if (!repo.fullName.trim()) throw new TypeError('GitHub repository fullName is required');

  const sourceRef: KnowledgeSourceRef = {
    system: 'github',
    sourceNativeId: repo.id,
    url: repo.url,
  };
  const status: KnowledgeEntityStatus = repo.archived ? 'archived' : 'active';
  const source = createSourceRecord({
    system: 'github',
    sourceNativeId: repo.id,
    title: repo.name,
    url: repo.url,
    observedAt: repo.observedAt,
    metadata: {
      fullName: repo.fullName,
      visibility: repo.visibility,
      defaultBranch: repo.defaultBranch,
      size: repo.size,
      archived: repo.archived,
      ...(repo.searchIndexed === undefined ? {} : { searchIndexed: repo.searchIndexed }),
    },
  });

  const repository = createCanonicalEntity({
    kind: 'repository',
    canonicalName: repo.fullName,
    aliases: [repo.name],
    status,
    sourceRefs: [sourceRef],
    tags: ['github'],
    createdAt: repo.observedAt,
    updatedAt: repo.observedAt,
    metadata: {
      visibility: repo.visibility,
      defaultBranch: repo.defaultBranch,
      size: repo.size,
      archived: repo.archived,
      ...(repo.searchIndexed === undefined ? {} : { searchIndexed: repo.searchIndexed }),
    },
  });

  const projectName = displayEntityName(repo.name) || repo.name;
  const project = createCanonicalEntity({
    kind: 'project',
    canonicalName: projectName,
    aliases: uniqueStrings([repo.name, repo.fullName]),
    status,
    sourceRefs: [sourceRef],
    tags: ['github-derived'],
    createdAt: repo.observedAt,
    updatedAt: repo.observedAt,
    metadata: {
      repositoryFullName: repo.fullName,
      repositoryVisibility: repo.visibility,
    },
  });

  const relationship = createRelationship(
    repository.id,
    project.id,
    'BELONGS_TO',
    [sourceRef],
  );

  return { source, repository, project, relationship };
}
