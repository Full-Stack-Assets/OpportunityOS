import { normalizeEntityName, type KnowledgeEntityKind, type KnowledgeEntityStatus, type KnowledgeSourceRef } from './buildgraph-knowledge.ts';

export interface KnowledgeRetrievalQuery {
  text: string;
  sourceSystem?: KnowledgeSourceRef['system'];
  sourceNativeId?: string;
  relatedEntityIds?: string[];
  embedding?: number[];
}

export interface KnowledgeRetrievalCandidate {
  id: string;
  kind?: KnowledgeEntityKind;
  canonicalName?: string;
  status?: KnowledgeEntityStatus;
  normalizedName: string;
  aliases: string[];
  sourceRefs: KnowledgeSourceRef[];
  text: string;
  relationships: string[];
  embedding?: number[];
}

export interface KnowledgeRetrievalResult {
  id: string;
  kind?: KnowledgeEntityKind;
  canonicalName?: string;
  status?: KnowledgeEntityStatus;
  sourceRefs: KnowledgeSourceRef[];
  sourceIdentityScore: number;
  nameScore: number;
  textScore: number;
  relationshipScore: number;
  embeddingScore: number;
  combinedScore: number;
  reasons: string[];
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) throw new TypeError('Embedding dimensions must match');
  if (left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError('Embedding values must be finite');
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return Number((dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))).toFixed(6));
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().normalize('NFKC').split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function overlapScore(query: string, candidate: string): number {
  const queryTokens = tokenSet(query);
  if (queryTokens.size === 0) return 0;
  const candidateTokens = tokenSet(candidate);
  let matches = 0;
  for (const token of queryTokens) if (candidateTokens.has(token)) matches += 1;
  return Number((matches / queryTokens.size).toFixed(6));
}

function nameMatchScore(query: string, candidate: KnowledgeRetrievalCandidate): number {
  const normalizedQuery = normalizeEntityName(query);
  if (!normalizedQuery) return 0;
  const names = [candidate.normalizedName, ...candidate.aliases.map(normalizeEntityName)].filter(Boolean);
  if (names.includes(normalizedQuery)) return 1;
  if (names.some((name) => name.includes(normalizedQuery) || normalizedQuery.includes(name))) return 0.75;
  return overlapScore(query, [candidate.canonicalName ?? '', candidate.normalizedName, ...candidate.aliases].join(' ')) * 0.6;
}

export function rankKnowledgeResults(
  query: KnowledgeRetrievalQuery,
  candidates: KnowledgeRetrievalCandidate[],
): KnowledgeRetrievalResult[] {
  const related = new Set(query.relatedEntityIds ?? []);
  return candidates.map((candidate) => {
    const exactSourceIdentity = Boolean(
      query.sourceSystem
        && query.sourceNativeId
        && candidate.sourceRefs.some((ref) => ref.system === query.sourceSystem && ref.sourceNativeId === query.sourceNativeId),
    );
    const sourceIdentityScore = exactSourceIdentity ? 1 : 0;
    const nameScore = nameMatchScore(query.text, candidate);
    const textScore = overlapScore(query.text, candidate.text);
    const relationshipScore = related.size === 0
      ? 0
      : candidate.relationships.some((entityId) => related.has(entityId)) ? 1 : 0;
    const embeddingScore = query.embedding && candidate.embedding
      ? Math.max(0, cosineSimilarity(query.embedding, candidate.embedding))
      : 0;

    const baseScore = (nameScore * 0.4) + (textScore * 0.25) + (relationshipScore * 0.2) + (embeddingScore * 0.15);
    const combinedScore = Number((sourceIdentityScore === 1 ? 2 + baseScore : baseScore).toFixed(6));
    const reasons: string[] = [];
    if (sourceIdentityScore) reasons.push('exact-source-identity');
    if (nameScore) reasons.push(`name:${nameScore.toFixed(3)}`);
    if (textScore) reasons.push(`text:${textScore.toFixed(3)}`);
    if (relationshipScore) reasons.push('related-entity');
    if (embeddingScore) reasons.push(`embedding:${embeddingScore.toFixed(3)}`);
    if (candidate.status === 'archived') reasons.push('archived');

    return {
      id: candidate.id,
      ...(candidate.kind ? { kind: candidate.kind } : {}),
      ...(candidate.canonicalName ? { canonicalName: candidate.canonicalName } : {}),
      ...(candidate.status ? { status: candidate.status } : {}),
      sourceRefs: candidate.sourceRefs,
      sourceIdentityScore,
      nameScore,
      textScore,
      relationshipScore,
      embeddingScore,
      combinedScore,
      reasons,
    };
  }).filter((result) => result.combinedScore > 0)
    .sort((left, right) => right.combinedScore - left.combinedScore || left.id.localeCompare(right.id));
}
