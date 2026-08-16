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
const RANGE_PATTERN = /\$\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*([kKmM])?\s*(?:-|to)\s*\$?\s?([0-9][0-9,]*(?:\.\d{1,2})?)\s*([kKmM])?/i;

function toCents(raw: string, suffix: string | undefined): number {
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) throw new TypeError('ECONOMIC_AMOUNT_INVALID');
  const multiplier = suffix?.toLowerCase() === 'm' ? 1_000_000 : suffix?.toLowerCase() === 'k' ? 1_000 : 1;
  return Math.round(value * multiplier * 100);
}

function classifyObservedKind(statement: string, isRange: boolean): EconomicAmountKind {
  if (/\brecoverable\b/i.test(statement) && /\b(loss|revenue|billing|payment)\b/i.test(statement)) {
    return 'RECOVERABLE_LOSS';
  }
  if (/\bbudget\b/i.test(statement) && isRange) return 'BUDGET_RANGE';
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

    const rangeMatch = statement.match(RANGE_PATTERN);
    if (rangeMatch?.[1] && rangeMatch[3]) {
      const first = toCents(rangeMatch[1], rangeMatch[2]);
      const second = toCents(rangeMatch[3], rangeMatch[4]);
      const minCents = Math.min(first, second);
      const maxCents = Math.max(first, second);
      const kind = classifyObservedKind(statement, true);
      for (const ref of fact.evidenceRefs) evidenceRefs.add(ref);
      amounts.push({
        kind,
        minCents,
        maxCents,
        currency: 'USD',
        statement: fact.statement,
        evidenceRefs: [...fact.evidenceRefs],
        confidence: kind === 'OTHER_EXPOSURE' ? 0.6 : 1,
        observedOnly: true,
      });
      continue;
    }

    const match = statement.match(MONEY_PATTERN);
    if (!match?.[1]) continue;
    const kind = classifyObservedKind(statement, false);
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
