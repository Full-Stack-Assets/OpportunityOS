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

function validateArguments(
  evidence: unknown,
  scoringInputs: unknown,
  options: unknown,
): number {
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

export function aggregateOpportunities(
  evidence: MarketplaceOpportunityEvidence[],
  scoringInputs: OpportunityScoringInputs[],
  options?: { shortlistLimit?: number },
): AggregateOpportunityResult {
  validateArguments(evidence, scoringInputs, options);

  const accepted: AcceptedBuyerRecord[] = [];
  const intelligence: IntelligenceRecord[] = [];
  const rejected: RejectedRecord[] = [];

  for (let inputIndex = 0; inputIndex < evidence.length; inputIndex += 1) {
    const record = evidence[inputIndex];
    try {
      assertVerifiedMarketplaceOpportunityEvidence(record);
    } catch {
      const unverified = typeof record === 'object' && record !== null && (record as { verified?: unknown }).verified !== true;
      rejected.push({
        input_index: inputIndex,
        evidence_id: safelyRecoverEvidenceId(record),
        primary_disposition: unverified ? 'rejected_unverified' : 'rejected_invalid',
        reason: unverified ? 'unverified_source' : 'invalid_source_contract',
      });
      continue;
    }

    const evidenceId = marketplaceEvidenceId(record);
    if (isBuyerOpportunityEvidence(record)) {
      accepted.push({
        evidence_id: evidenceId,
        evidence: record,
        primary_disposition: 'accepted_buyer',
        ranking_disposition: 'missing_scoring_inputs',
      });
    } else {
      intelligence.push({
        evidence_id: evidenceId,
        evidence: record,
        primary_disposition: 'service_listing_intelligence',
        reason: 'service_listing',
      });
    }
  }

  accepted.sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  intelligence.sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  rejected.sort((a, b) => a.input_index - b.input_index);

  return {
    accepted,
    intelligence,
    rejected,
    duplicates: [],
    invalidScoringInputs: [],
    shortlist: [],
    stats: {
      received: evidence.length,
      verified: accepted.length + intelligence.length,
      buyerOpportunities: accepted.length,
      serviceListings: intelligence.length,
      duplicates: 0,
      rejected: rejected.length,
      invalidScoringInputs: 0,
      unusedScoringInputs: 0,
      rankEligible: 0,
      shortlisted: 0,
    },
  };
}
