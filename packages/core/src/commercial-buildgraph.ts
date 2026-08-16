import type {BuildGraphDecision, BuildGraphPreflightResult} from './buildgraph.ts';

export interface VerifiedBuildGraphEvidenceItem {
  id: string;
  kind: 'PROJECT' | 'CAPABILITY' | 'ARTIFACT';
  title: string;
  description: string;
  tags: string[];
  verified: boolean;
  evidenceRefs: string[];
}

export interface BuildGraphCommercialEvidence {
  preflight: BuildGraphPreflightResult;
  items: VerifiedBuildGraphEvidenceItem[];
}

export interface CommercialCapabilityMatch {
  state: 'VERIFIED_MATCH' | 'PARTIAL_MATCH' | 'EVIDENCE_GAP';
  score: number | null;
  projectIds: string[];
  capabilityIds: string[];
  artifactIds: string[];
  evidenceRefs: string[];
  reuseDecision: BuildGraphDecision | null;
  proofPlan: string[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'for', 'in', 'need', 'needs', 'of', 'on', 'the', 'to', 'with',
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 1 && !STOPWORDS.has(term)),
  );
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const term of left) {
    if (right.has(term)) overlap += 1;
  }
  const denominator = Math.min(left.size, right.size);
  return denominator === 0 ? 0 : Math.min(1, overlap / denominator);
}

function validVerifiedItem(item: VerifiedBuildGraphEvidenceItem): boolean {
  return item.verified
    && item.id.trim().length > 0
    && item.evidenceRefs.some((ref) => ref.trim().length > 0);
}

function emptyGap(reuseDecision: BuildGraphDecision | null = null): CommercialCapabilityMatch {
  return {
    state: 'EVIDENCE_GAP',
    score: null,
    projectIds: [],
    capabilityIds: [],
    artifactIds: [],
    evidenceRefs: [],
    reuseDecision,
    proofPlan: ['VERIFY_BUILDGRAPH_CAPABILITY_EVIDENCE'],
  };
}

function verifiedReuseDecision(preflight: BuildGraphPreflightResult): BuildGraphDecision | null {
  return preflight.requestId.trim() && preflight.payloadHash.trim() ? preflight.decision : null;
}

export function crossMatchBuildGraphCommercialEvidence(input: {
  demandText: string;
  evidence: BuildGraphCommercialEvidence | null;
}): CommercialCapabilityMatch {
  if (input.evidence === null) return emptyGap();

  const reuseDecision = verifiedReuseDecision(input.evidence.preflight);
  const demandTerms = tokens(input.demandText);
  const verifiedItems = input.evidence.items.filter(validVerifiedItem);
  if (verifiedItems.length === 0 || demandTerms.size === 0) return emptyGap(reuseDecision);

  const scored = verifiedItems
    .map((item) => {
      const itemTerms = tokens([item.title, item.description, ...item.tags].join(' '));
      return {item, score: overlapScore(demandTerms, itemTerms)};
    })
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  if (scored.length === 0) return emptyGap(reuseDecision);

  const bestScore = scored[0]?.score ?? 0;
  const projectIds = scored.filter(({item}) => item.kind === 'PROJECT').map(({item}) => item.id).sort();
  const capabilityIds = scored.filter(({item}) => item.kind === 'CAPABILITY').map(({item}) => item.id).sort();
  const artifactIds = scored.filter(({item}) => item.kind === 'ARTIFACT').map(({item}) => item.id).sort();
  const evidenceRefs = [...new Set(scored.flatMap(({item}) => item.evidenceRefs.filter((ref) => ref.trim())))].sort();

  return {
    state: bestScore >= 0.7 ? 'VERIFIED_MATCH' : 'PARTIAL_MATCH',
    score: Math.round(bestScore * 10_000) / 10_000,
    projectIds,
    capabilityIds,
    artifactIds,
    evidenceRefs,
    reuseDecision,
    proofPlan: bestScore >= 0.7 ? [] : ['STRENGTHEN_BUILDGRAPH_CAPABILITY_EVIDENCE'],
  };
}
