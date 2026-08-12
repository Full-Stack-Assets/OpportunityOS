import { rankOpportunities } from './opportunity.ts';
import {
  assertVerifiedMarketplaceOpportunityEvidence,
  isBuyerOpportunityEvidence,
  marketplaceEvidenceId,
  type MarketplaceOpportunityEvidence,
  type VerifiedMarketplaceOpportunityEvidence,
} from './source.ts';

export interface OpportunityScoringInputs {
  evidence_id: string;
  capabilityFit: number;
  evidenceQuality: number;
  expectedValueCents?: number;
  effortPoints: number;
  deadlineUrgency: number;
}

export type BuyerRankingDisposition =
  | 'shortlisted'
  | 'ranked_not_shortlisted'
  | 'missing_scoring_inputs'
  | 'duplicate_scoring_inputs';

export interface AcceptedBuyerRecord {
  evidence_id: string;
  evidence: VerifiedMarketplaceOpportunityEvidence;
  primary_disposition: 'accepted_buyer';
  ranking_disposition: BuyerRankingDisposition;
}

export interface IntelligenceRecord {
  evidence_id: string;
  evidence: VerifiedMarketplaceOpportunityEvidence;
  primary_disposition: 'service_listing_intelligence';
  reason: 'service_listing';
}

export interface RejectedRecord {
  input_index: number;
  evidence_id: string | null;
  primary_disposition: 'rejected_unverified' | 'rejected_invalid';
  reason: 'unverified_source' | 'invalid_source_contract';
}

export interface DuplicateRecord {
  duplicate_input_index: number;
  retained_evidence_id: string;
  reason: 'exact_identity' | 'source_equivalent';
}

export interface InvalidScoringInput {
  input_index: number;
  evidence_id: string | null;
  reason: 'invalid_scoring_input';
}

export interface ShortlistedOpportunity {
  evidence_id: string;
  score: number;
}

export interface AggregateOpportunityResult {
  accepted: AcceptedBuyerRecord[];
  intelligence: IntelligenceRecord[];
  rejected: RejectedRecord[];
  duplicates: DuplicateRecord[];
  invalidScoringInputs: InvalidScoringInput[];
  shortlist: ShortlistedOpportunity[];
  stats: {
    received: number;
    verified: number;
    buyerOpportunities: number;
    serviceListings: number;
    duplicates: number;
    rejected: number;
    invalidScoringInputs: number;
    unusedScoringInputs: number;
    rankEligible: number;
    shortlisted: number;
  };
}

interface IndexedEvidence {
  input_index: number;
  evidence_id: string;
  evidence: VerifiedMarketplaceOpportunityEvidence;
}

interface IndexedScoring {
  input_index: number;
  value: OpportunityScoringInputs;
}

function validateArguments(evidence: unknown, scoringInputs: unknown, options: unknown): number {
  if (!Array.isArray(evidence)) throw new TypeError('evidence must be an array');
  if (!Array.isArray(scoringInputs)) throw new TypeError('scoringInputs must be an array');
  if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
    throw new TypeError('options must be an object');
  }
  const shortlistLimit = (options as { shortlistLimit?: unknown } | undefined)?.shortlistLimit ?? 10;
  if (!Number.isInteger(shortlistLimit) || (shortlistLimit as number) < 1 || (shortlistLimit as number) > 100) {
    throw new TypeError('shortlistLimit must be an integer between 1 and 100');
  }
  return shortlistLimit as number;
}

function safelyRecoverEvidenceId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { platform?: unknown; platform_id?: unknown };
  if (typeof candidate.platform !== 'string' || !candidate.platform.trim()) return null;
  if (typeof candidate.platform_id !== 'string' || !candidate.platform_id.trim()) return null;
  return `${candidate.platform.trim()}:${candidate.platform_id.trim()}`;
}

function canonicalCompare(a: IndexedEvidence, b: IndexedEvidence): number {
  const timeA = Date.parse(a.evidence.retrieved_at);
  const timeB = Date.parse(b.evidence.retrieved_at);
  if (timeA !== timeB) return timeB - timeA;
  const urlOrder = a.evidence.source_url.localeCompare(b.evidence.source_url);
  if (urlOrder !== 0) return urlOrder;
  return a.input_index - b.input_index;
}

function normalizeTitle(title: string): string {
  return title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function dedupeUrlKey(sourceUrl: string): string | null {
  try {
    const parsed = new URL(sourceUrl);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.search = '';
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function validFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateScoringRow(value: unknown): value is OpportunityScoringInputs {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as Partial<OpportunityScoringInputs>;
  if (typeof row.evidence_id !== 'string' || !row.evidence_id.trim()) return false;
  if (!validFiniteNumber(row.capabilityFit)) return false;
  if (!validFiniteNumber(row.evidenceQuality)) return false;
  if (!validFiniteNumber(row.effortPoints)) return false;
  if (!validFiniteNumber(row.deadlineUrgency)) return false;
  if (row.expectedValueCents !== undefined && (!Number.isInteger(row.expectedValueCents) || row.expectedValueCents < 0)) return false;
  return true;
}

export function aggregateOpportunities(
  evidence: MarketplaceOpportunityEvidence[],
  scoringInputs: OpportunityScoringInputs[],
  options?: { shortlistLimit?: number },
): AggregateOpportunityResult {
  const shortlistLimit = validateArguments(evidence, scoringInputs, options);

  const rejected: RejectedRecord[] = [];
  const verified: IndexedEvidence[] = [];

  for (let inputIndex = 0; inputIndex < evidence.length; inputIndex += 1) {
    const record = evidence[inputIndex];
    try {
      assertVerifiedMarketplaceOpportunityEvidence(record);
      verified.push({ input_index: inputIndex, evidence_id: marketplaceEvidenceId(record), evidence: record });
    } catch {
      const unverified = typeof record === 'object' && record !== null && (record as { verified?: unknown }).verified !== true;
      rejected.push({
        input_index: inputIndex,
        evidence_id: safelyRecoverEvidenceId(record),
        primary_disposition: unverified ? 'rejected_unverified' : 'rejected_invalid',
        reason: unverified ? 'unverified_source' : 'invalid_source_contract',
      });
    }
  }

  const duplicates: DuplicateRecord[] = [];
  const exactGroups = new Map<string, IndexedEvidence[]>();
  for (const item of verified) {
    const group = exactGroups.get(item.evidence_id) ?? [];
    group.push(item);
    exactGroups.set(item.evidence_id, group);
  }

  const exactCanonical: IndexedEvidence[] = [];
  for (const [evidenceId, group] of exactGroups) {
    group.sort(canonicalCompare);
    exactCanonical.push(group[0]);
    for (const duplicate of group.slice(1)) {
      duplicates.push({ duplicate_input_index: duplicate.input_index, retained_evidence_id: evidenceId, reason: 'exact_identity' });
    }
  }

  const buyerExact = exactCanonical.filter((item) => isBuyerOpportunityEvidence(item.evidence));
  const intelligenceExact = exactCanonical.filter((item) => !isBuyerOpportunityEvidence(item.evidence));

  const sourceGroups = new Map<string, IndexedEvidence[]>();
  const buyersWithoutStage2Key: IndexedEvidence[] = [];
  for (const item of buyerExact) {
    const urlKey = dedupeUrlKey(item.evidence.source_url);
    if (urlKey === null) {
      buyersWithoutStage2Key.push(item);
      continue;
    }
    const key = `${item.evidence.platform}\u0000${urlKey}\u0000${normalizeTitle(item.evidence.title)}`;
    const group = sourceGroups.get(key) ?? [];
    group.push(item);
    sourceGroups.set(key, group);
  }

  const canonicalBuyers: IndexedEvidence[] = [...buyersWithoutStage2Key];
  for (const group of sourceGroups.values()) {
    group.sort(canonicalCompare);
    const retained = group[0];
    canonicalBuyers.push(retained);
    for (const duplicate of group.slice(1)) {
      duplicates.push({ duplicate_input_index: duplicate.input_index, retained_evidence_id: retained.evidence_id, reason: 'source_equivalent' });
    }
  }

  duplicates.sort((a, b) => a.retained_evidence_id.localeCompare(b.retained_evidence_id) || a.duplicate_input_index - b.duplicate_input_index);

  const invalidScoringInputs: InvalidScoringInput[] = [];
  const validScoringRows: IndexedScoring[] = [];
  for (let inputIndex = 0; inputIndex < scoringInputs.length; inputIndex += 1) {
    const value = scoringInputs[inputIndex] as unknown;
    if (!validateScoringRow(value)) {
      const evidenceId = typeof value === 'object' && value !== null && typeof (value as { evidence_id?: unknown }).evidence_id === 'string'
        ? ((value as { evidence_id: string }).evidence_id.trim() || null)
        : null;
      invalidScoringInputs.push({ input_index: inputIndex, evidence_id: evidenceId, reason: 'invalid_scoring_input' });
    } else {
      validScoringRows.push({ input_index: inputIndex, value });
    }
  }

  const canonicalBuyerIds = new Set(canonicalBuyers.map((item) => item.evidence_id));
  const scoringByEvidenceId = new Map<string, IndexedScoring[]>();
  let unusedScoringInputs = 0;
  for (const row of validScoringRows) {
    if (!canonicalBuyerIds.has(row.value.evidence_id)) {
      unusedScoringInputs += 1;
      continue;
    }
    const group = scoringByEvidenceId.get(row.value.evidence_id) ?? [];
    group.push(row);
    scoringByEvidenceId.set(row.value.evidence_id, group);
  }

  const accepted: AcceptedBuyerRecord[] = canonicalBuyers.map((item) => {
    const scoringRows = scoringByEvidenceId.get(item.evidence_id) ?? [];
    const ranking_disposition: BuyerRankingDisposition = scoringRows.length === 0
      ? 'missing_scoring_inputs'
      : scoringRows.length > 1
        ? 'duplicate_scoring_inputs'
        : 'ranked_not_shortlisted';
    return {
      evidence_id: item.evidence_id,
      evidence: item.evidence,
      primary_disposition: 'accepted_buyer',
      ranking_disposition,
    };
  });

  const intelligence: IntelligenceRecord[] = intelligenceExact.map((item) => ({
    evidence_id: item.evidence_id,
    evidence: item.evidence,
    primary_disposition: 'service_listing_intelligence',
    reason: 'service_listing',
  }));

  const rankCandidates = accepted
    .filter((item) => (scoringByEvidenceId.get(item.evidence_id) ?? []).length === 1)
    .map((item) => {
      const scoring = scoringByEvidenceId.get(item.evidence_id)![0].value;
      return {
        id: item.evidence_id,
        capabilityFit: scoring.capabilityFit,
        evidenceQuality: scoring.evidenceQuality,
        expectedValueCents: scoring.expectedValueCents,
        effortPoints: scoring.effortPoints,
        deadlineUrgency: scoring.deadlineUrgency,
      };
    });

  const ranked = rankOpportunities(rankCandidates);
  const shortlist = ranked.slice(0, shortlistLimit).map((item) => ({ evidence_id: item.id, score: item.score }));
  const shortlistIds = new Set(shortlist.map((item) => item.evidence_id));
  const rankEligibleIds = new Set(ranked.map((item) => item.id));

  for (const item of accepted) {
    if (shortlistIds.has(item.evidence_id)) item.ranking_disposition = 'shortlisted';
    else if (rankEligibleIds.has(item.evidence_id)) item.ranking_disposition = 'ranked_not_shortlisted';
  }

  accepted.sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  intelligence.sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  rejected.sort((a, b) => a.input_index - b.input_index);
  invalidScoringInputs.sort((a, b) => a.input_index - b.input_index);

  return {
    accepted,
    intelligence,
    rejected,
    duplicates,
    invalidScoringInputs,
    shortlist,
    stats: {
      received: evidence.length,
      verified: verified.length,
      buyerOpportunities: accepted.length,
      serviceListings: intelligence.length,
      duplicates: duplicates.length,
      rejected: rejected.length,
      invalidScoringInputs: invalidScoringInputs.length,
      unusedScoringInputs,
      rankEligible: ranked.length,
      shortlisted: shortlist.length,
    },
  };
}
