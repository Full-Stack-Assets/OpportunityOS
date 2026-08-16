import type {ObservedEconomicAmount} from './economic-pain.ts';

export interface ContractValueEstimate {
  minCents: number | null;
  expectedCents: number | null;
  maxCents: number | null;
  currency: 'USD' | null;
  confidence: number;
  basis: 'FIXED_CONTRACT' | 'BUDGET_RANGE' | 'BUDGET_CEILING' | 'INSUFFICIENT_EVIDENCE';
  evidenceRefs: string[];
  assumptions: string[];
}

export interface CommercialValueReport {
  observedBudget: ObservedEconomicAmount[];
  observedExposure: ObservedEconomicAmount[];
  contractValue: ContractValueEstimate;
}

export interface PursuitEconomics {
  expectedContractValueCents: number | null;
  modeledWinProbability: number | null;
  expectedGrossPursuitValueCents: number | null;
  estimatedPursuitCostCents: number | null;
  expectedNetPursuitValueCents: number | null;
  currency: 'USD' | null;
}

const BUDGET_KINDS = new Set<ObservedEconomicAmount['kind']>([
  'FIXED_CONTRACT_VALUE',
  'BUDGET_RANGE',
  'EXPLICIT_BUDGET',
]);

function validateAmount(amount: ObservedEconomicAmount): void {
  if (!amount.evidenceRefs.some((ref) => ref.trim().length > 0)) {
    throw new TypeError('COMMERCIAL_VALUE_EVIDENCE_REQUIRED');
  }
  for (const value of [amount.minCents, amount.maxCents]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError('COMMERCIAL_VALUE_AMOUNT_INVALID');
    }
  }
  if (amount.minCents !== null && amount.maxCents !== null && amount.minCents > amount.maxCents) {
    throw new TypeError('COMMERCIAL_VALUE_RANGE_INVALID');
  }
  if (!Number.isFinite(amount.confidence) || amount.confidence < 0 || amount.confidence > 1) {
    throw new TypeError('COMMERCIAL_VALUE_CONFIDENCE_INVALID');
  }
}

function highestByMax(items: ObservedEconomicAmount[]): ObservedEconomicAmount | null {
  return [...items].sort((a, b) => {
    const aMax = a.maxCents ?? -1;
    const bMax = b.maxCents ?? -1;
    return bMax - aMax || a.statement.localeCompare(b.statement);
  })[0] ?? null;
}

function refs(amount: ObservedEconomicAmount): string[] {
  return [...new Set(amount.evidenceRefs.filter((ref) => ref.trim().length > 0))].sort();
}

function insufficient(): ContractValueEstimate {
  return {
    minCents: null,
    expectedCents: null,
    maxCents: null,
    currency: null,
    confidence: 0,
    basis: 'INSUFFICIENT_EVIDENCE',
    evidenceRefs: [],
    assumptions: [],
  };
}

export function estimateCommercialValue(amounts: ObservedEconomicAmount[]): CommercialValueReport {
  if (!Array.isArray(amounts)) throw new TypeError('COMMERCIAL_VALUE_AMOUNTS_INVALID');
  amounts.forEach(validateAmount);

  const observedBudget = amounts.filter((amount) => BUDGET_KINDS.has(amount.kind));
  const observedExposure = amounts.filter((amount) => !BUDGET_KINDS.has(amount.kind));

  const fixed = highestByMax(observedBudget.filter((amount) => amount.kind === 'FIXED_CONTRACT_VALUE'));
  let contractValue: ContractValueEstimate;

  if (fixed !== null && fixed.minCents !== null && fixed.maxCents !== null && fixed.minCents === fixed.maxCents) {
    contractValue = {
      minCents: fixed.minCents,
      expectedCents: fixed.maxCents,
      maxCents: fixed.maxCents,
      currency: 'USD',
      confidence: fixed.confidence,
      basis: 'FIXED_CONTRACT',
      evidenceRefs: refs(fixed),
      assumptions: [],
    };
  } else {
    const range = highestByMax(observedBudget.filter((amount) => amount.kind === 'BUDGET_RANGE'));
    if (range !== null && range.minCents !== null && range.maxCents !== null) {
      contractValue = {
        minCents: range.minCents,
        expectedCents: Math.round((range.minCents + range.maxCents) / 2),
        maxCents: range.maxCents,
        currency: 'USD',
        confidence: Math.min(range.confidence, 0.8),
        basis: 'BUDGET_RANGE',
        evidenceRefs: refs(range),
        assumptions: ['MATHEMATICAL_MIDPOINT_OF_VERIFIED_BUDGET_RANGE'],
      };
    } else {
      const ceiling = highestByMax(observedBudget.filter((amount) => amount.kind === 'EXPLICIT_BUDGET'));
      if (ceiling !== null && ceiling.maxCents !== null) {
        contractValue = {
          minCents: null,
          expectedCents: null,
          maxCents: ceiling.maxCents,
          currency: 'USD',
          confidence: Math.min(ceiling.confidence, 0.7),
          basis: 'BUDGET_CEILING',
          evidenceRefs: refs(ceiling),
          assumptions: [],
        };
      } else {
        contractValue = insufficient();
      }
    }
  }

  return {
    observedBudget: [...observedBudget],
    observedExposure: [...observedExposure],
    contractValue,
  };
}

export function calculatePursuitEconomics(input: {
  contractValue: ContractValueEstimate;
  winProbability: number | null;
  estimatedPursuitCostCents: number | null;
}): PursuitEconomics {
  if (input.winProbability !== null
    && (!Number.isFinite(input.winProbability) || input.winProbability < 0 || input.winProbability > 1)) {
    throw new TypeError('WIN_PROBABILITY_INVALID');
  }
  if (input.estimatedPursuitCostCents !== null
    && (!Number.isSafeInteger(input.estimatedPursuitCostCents) || input.estimatedPursuitCostCents < 0)) {
    throw new TypeError('PURSUIT_COST_INVALID');
  }

  const expectedContractValueCents = input.contractValue.expectedCents;
  const expectedGrossPursuitValueCents = expectedContractValueCents !== null && input.winProbability !== null
    ? Math.round(expectedContractValueCents * input.winProbability)
    : null;
  const expectedNetPursuitValueCents = expectedGrossPursuitValueCents !== null && input.estimatedPursuitCostCents !== null
    ? expectedGrossPursuitValueCents - input.estimatedPursuitCostCents
    : null;

  return {
    expectedContractValueCents,
    modeledWinProbability: input.winProbability,
    expectedGrossPursuitValueCents,
    estimatedPursuitCostCents: input.estimatedPursuitCostCents,
    expectedNetPursuitValueCents,
    currency: input.contractValue.currency,
  };
}
