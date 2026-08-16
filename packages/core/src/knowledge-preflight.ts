import type { KnowledgeEntityKind, KnowledgeEntityStatus, KnowledgeSourceRef } from './buildgraph-knowledge.ts';

export interface KnowledgePreflightRequest {
  name: string;
  description: string;
  capabilities: string[];
}

export interface KnowledgePreflightCandidate {
  id: string;
  kind: KnowledgeEntityKind;
  canonicalName: string;
  status: KnowledgeEntityStatus;
  combinedScore: number;
  sourceIdentityScore: number;
  reasons: string[];
  sourceRefs: KnowledgeSourceRef[];
}

export interface KnowledgePreflightRegistryResult {
  available: boolean;
  ambiguous?: boolean;
  results: KnowledgePreflightCandidate[];
}

export type KnowledgePreflightStatus =
  | 'REUSE_EVIDENCE_FOUND'
  | 'NO_REUSE_EVIDENCE'
  | 'REVIEW'
  | 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE';

export interface KnowledgePreflightEvidence {
  request: KnowledgePreflightRequest;
  status: KnowledgePreflightStatus;
  allowCreateNew: boolean;
  candidates: KnowledgePreflightCandidate[];
  sourceEvidence: KnowledgeSourceRef[];
  activeCandidates: string[];
  archivedCandidates: string[];
  decisionsAndConstraints: string[];
  reusableAssets: string[];
}

function uniqueSourceRefs(candidates: KnowledgePreflightCandidate[]): KnowledgeSourceRef[] {
  const byKey = new Map<string, KnowledgeSourceRef>();
  for (const candidate of candidates) {
    for (const ref of candidate.sourceRefs) {
      const key = `${ref.system}\u0000${ref.sourceNativeId}\u0000${ref.url ?? ''}`;
      if (!byKey.has(key)) byKey.set(key, ref);
    }
  }
  return [...byKey.values()].sort((a, b) => `${a.system}:${a.sourceNativeId}`.localeCompare(`${b.system}:${b.sourceNativeId}`));
}

function isReusableKind(kind: KnowledgeEntityKind): boolean {
  return ['project', 'product', 'repository', 'component', 'capability', 'skill', 'agent', 'automation', 'artifact', 'integration'].includes(kind);
}

export function compileKnowledgePreflight(
  request: KnowledgePreflightRequest,
  registry: KnowledgePreflightRegistryResult,
): KnowledgePreflightEvidence {
  if (!registry.available) {
    return {
      request,
      status: 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE',
      allowCreateNew: false,
      candidates: [],
      sourceEvidence: [],
      activeCandidates: [],
      archivedCandidates: [],
      decisionsAndConstraints: [],
      reusableAssets: [],
    };
  }

  const candidates = [...registry.results]
    .filter((candidate) => Number.isFinite(candidate.combinedScore) && candidate.combinedScore >= 0)
    .sort((a, b) => b.combinedScore - a.combinedScore || a.id.localeCompare(b.id));
  const strongReusable = candidates.filter((candidate) => isReusableKind(candidate.kind) && candidate.combinedScore >= 0.65);
  const strongActiveReusable = strongReusable.filter((candidate) => candidate.status === 'active');
  const strongHistoricalReusable = strongReusable.filter((candidate) => candidate.status !== 'active');
  const ambiguous = Boolean(registry.ambiguous) || (
    strongActiveReusable.length > 1
    && strongActiveReusable[0]!.combinedScore >= 0.85
    && strongActiveReusable[1]!.combinedScore >= 0.85
    && Math.abs(strongActiveReusable[0]!.combinedScore - strongActiveReusable[1]!.combinedScore) <= 0.03
  );

  const status: KnowledgePreflightStatus = ambiguous
    ? 'REVIEW'
    : strongActiveReusable.length > 0
      ? 'REUSE_EVIDENCE_FOUND'
      : strongHistoricalReusable.length > 0
        ? 'REVIEW'
        : 'NO_REUSE_EVIDENCE';

  return {
    request,
    status,
    allowCreateNew: status === 'NO_REUSE_EVIDENCE',
    candidates,
    sourceEvidence: uniqueSourceRefs(candidates),
    activeCandidates: candidates.filter((candidate) => candidate.status === 'active').map((candidate) => candidate.id),
    archivedCandidates: candidates.filter((candidate) => candidate.status === 'archived').map((candidate) => candidate.id),
    decisionsAndConstraints: candidates.filter((candidate) => candidate.kind === 'decision' || candidate.kind === 'constraint').map((candidate) => candidate.id),
    reusableAssets: candidates.filter((candidate) => isReusableKind(candidate.kind)).map((candidate) => candidate.id),
  };
}

export function decideKnowledgePreflightAvailability(
  evidence: KnowledgePreflightEvidence,
): 'READY' | 'REVIEW' | 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE' {
  if (evidence.status === 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE') return 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE';
  if (evidence.status === 'REVIEW' || evidence.status === 'REUSE_EVIDENCE_FOUND') return 'REVIEW';
  return 'READY';
}
