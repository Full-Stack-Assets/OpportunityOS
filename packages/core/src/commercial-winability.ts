export interface WinabilityInputs {
  capabilityEvidence: number | null;
  eligibility: number | null;
  buyerIntent: number | null;
  credibility: number | null;
  scopeFit: number | null;
  reuseEfficiency: number | null;
  freshnessUrgency: number | null;
  competitionCloseability: number | null;
  hardDisqualifiers: string[];
  evidenceRefs: string[];
}

export interface WinProbabilityEstimate {
  probability: number | null;
  confidence: number;
  calibrationState: 'UNCALIBRATED_V1';
  knownInputs: string[];
  unknownInputs: string[];
  evidenceRefs: string[];
  reasons: string[];
}

const WEIGHTS = {
  capabilityEvidence: 25,
  eligibility: 20,
  buyerIntent: 15,
  credibility: 10,
  scopeFit: 10,
  reuseEfficiency: 10,
  freshnessUrgency: 5,
  competitionCloseability: 5,
} as const;

type WeightedKey = keyof typeof WEIGHTS;

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function validateFactor(key: WeightedKey, value: number | null): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`WINABILITY_FACTOR_INVALID:${key}`);
  }
}

export function estimateWinProbability(input: WinabilityInputs): WinProbabilityEstimate {
  const knownInputs: string[] = [];
  const unknownInputs: string[] = [];
  let weightedTotal = 0;
  let knownWeight = 0;

  for (const key of Object.keys(WEIGHTS) as WeightedKey[]) {
    const value = input[key];
    validateFactor(key, value);
    if (value === null) {
      unknownInputs.push(key);
      continue;
    }
    knownInputs.push(key);
    const weight = WEIGHTS[key];
    knownWeight += weight;
    weightedTotal += value * weight;
  }

  const confidence = round4(knownWeight / 100);
  const evidenceRefs = [...new Set(input.evidenceRefs.filter((ref) => ref.trim().length > 0))].sort();
  const hardDisqualifiers = [...new Set(input.hardDisqualifiers.filter((value) => value.trim().length > 0))].sort();

  if (hardDisqualifiers.length > 0) {
    return {
      probability: 0,
      confidence,
      calibrationState: 'UNCALIBRATED_V1',
      knownInputs: knownInputs.sort(),
      unknownInputs: unknownInputs.sort(),
      evidenceRefs,
      reasons: ['HARD_DISQUALIFIER', ...hardDisqualifiers.map((value) => `DISQUALIFIER:${value}`)],
    };
  }

  return {
    probability: knownWeight === 0 ? null : round4(weightedTotal / knownWeight),
    confidence,
    calibrationState: 'UNCALIBRATED_V1',
    knownInputs: knownInputs.sort(),
    unknownInputs: unknownInputs.sort(),
    evidenceRefs,
    reasons: knownWeight === 0 ? ['INSUFFICIENT_WINABILITY_EVIDENCE'] : ['UNCALIBRATED_MODEL_ESTIMATE'],
  };
}
