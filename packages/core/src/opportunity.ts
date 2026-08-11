export interface OpportunityCandidate {
  id: string;
  capabilityFit: number;
  evidenceQuality: number;
  expectedValueCents?: number;
  effortPoints: number;
  deadlineUrgency: number;
}

export interface RankedOpportunity extends OpportunityCandidate {
  score: number;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function valueScore(expectedValueCents: number | undefined): number {
  if (expectedValueCents === undefined) return 0;
  if (!Number.isInteger(expectedValueCents) || expectedValueCents < 0) throw new TypeError('expectedValueCents must be a non-negative integer');
  return clamp100((expectedValueCents / 100_000) * 100);
}

function effortScore(points: number): number {
  if (!Number.isFinite(points) || points < 0) throw new TypeError('effortPoints must be non-negative');
  return clamp100(100 - points * 10);
}

export function rankOpportunities(candidates: OpportunityCandidate[]): RankedOpportunity[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: Number((
        clamp100(candidate.capabilityFit) * 0.35 +
        clamp100(candidate.evidenceQuality) * 0.30 +
        valueScore(candidate.expectedValueCents) * 0.15 +
        effortScore(candidate.effortPoints) * 0.10 +
        clamp100(candidate.deadlineUrgency) * 0.10
      ).toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
