import type {DemandFact, VerificationState} from './acquisition.ts';

export type EconomicAmountKind =
  | 'EXPLICIT_BUDGET'
  | 'FIXED_CONTRACT_VALUE'
  | 'BUDGET_RANGE'
  | 'RECOVERABLE_LOSS'
  | 'REVENUE_EXPOSURE'
  | 'LABOR_COST'
  | 'COST_SAVINGS'
  | 'OTHER_EXPOSURE';

export interface ObservedEconomicAmount {
  kind: EconomicAmountKind;
  minCents: number | null;
  maxCents: number | null;
  currency: 'USD';
  statement: string;
  evidenceRefs: string[];
  confidence: number;
  observedOnly: true;
}

export interface EconomicPainReport {
  amounts: ObservedEconomicAmount[];
  contradictions: string[];
  evidenceRefs: string[];
}

const MONEY_PATTERN = /\$\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*([kKmM])?/;

function toCents(raw: string, suffix: string | undefined): number {
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) throw new TypeError('ECONOMIC_AMOUNT_INVALID');
  const multiplier = suffix?.toLowerCase() === 'm' ? 1_000_000 : suffix?.toLowerCase() === 'k' ? 1_000 : 1;
  return Math.round(value * multiplier * 100);
}

function classifyObservedKind(statement: string): EconomicAmountKind {
  if (/\brecoverable\b/i.test(statement) && /\b(loss|revenue|billing|payment)\b/i.test(statement)) {
    return 'RECOVERABLE_LOSS';
  }
  if (/\bbudget\b/i.test(statement)) return 'EXPLICIT_BUDGET';
  return 'OTHER_EXPOSURE';
}

export function extractObservedEconomicPain(input: {
  facts: DemandFact[];
  verificationState: VerificationState;
}): EconomicPainReport {
  if (input.verificationState !== 'VERIFIED') throw new TypeError('COMMERCIAL_SOURCE_NOT_VERIFIED');

  const amounts: ObservedEconomicAmount[] = [];
  const evidenceRefs = new Set<string>();

  for (const fact of input.facts) {
    const statement = fact.statement.trim();
    if (!statement || fact.evidenceRefs.length === 0) continue;
    const match = statement.match(MONEY_PATTERN);
    if (!match || !match[1]) continue;
    const kind = classifyObservedKind(statement);
    const cents = toCents(match[1], match[2]);
    for (const ref of fact.evidenceRefs) evidenceRefs.add(ref);
    amounts.push({
      kind,
      minCents: cents,
      maxCents: cents,
      currency: 'USD',
      statement: fact.statement,
      evidenceRefs: [...fact.evidenceRefs],
      confidence: kind === 'OTHER_EXPOSURE' ? 0.6 : 1,
      observedOnly: true,
    });
  }

  return {
    amounts,
    contradictions: [],
    evidenceRefs: [...evidenceRefs].sort(),
  };
}
