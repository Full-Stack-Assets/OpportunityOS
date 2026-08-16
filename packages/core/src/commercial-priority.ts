import type {PublicDemandCandidate} from './public-demand.ts';
import type {EconomicPainReport, EconomicAmountKind} from './economic-pain.ts';
import type {CommercialValueReport} from './commercial-value.ts';
import type {EligibilityAssessment} from './commercial-eligibility.ts';

export type CommercialPriority = 'P0_CRITICAL' | 'P0' | 'STRONG' | 'MONITOR' | 'REJECT';
export type CriticalReason = 'BUDGET' | 'RECOVERABLE_LOSS';

export interface CommercialPriorityResult {
  priority: CommercialPriority;
  criticalReason: CriticalReason | null;
  reasons: string[];
  externalActionAllowed: false;
}

const CRITICAL_CENTS = 100_000_000;
const P0_BUDGET_CENTS = 10_000_000;

function result(
  priority: CommercialPriority,
  criticalReason: CriticalReason | null,
  reasons: string[],
): CommercialPriorityResult {
  return {
    priority,
    criticalReason,
    reasons,
    externalActionAllowed: false,
  };
}

function maxVerifiedUsdCents(input: EconomicPainReport, kinds: EconomicAmountKind[]): number | null {
  const allowed = new Set<EconomicAmountKind>(kinds);
  const values = input.amounts
    .filter((amount) => allowed.has(amount.kind))
    .filter((amount) => amount.currency === 'USD')
    .filter((amount) => amount.observedOnly === true)
    .filter((amount) => amount.evidenceRefs.some((ref) => ref.trim().length > 0))
    .map((amount) => amount.maxCents)
    .filter((value): value is number => value !== null && Number.isSafeInteger(value) && value >= 0);
  return values.length === 0 ? null : Math.max(...values);
}

export function classifyCommercialPriority(input: {
  candidate: PublicDemandCandidate;
  pain: EconomicPainReport;
  value: CommercialValueReport;
  eligibility: EligibilityAssessment;
}): CommercialPriorityResult {
  void input.value;

  if (input.candidate.signal.verificationState !== 'VERIFIED') {
    return result('REJECT', null, ['SOURCE_NOT_VERIFIED']);
  }
  if (input.candidate.credibility.reject) {
    return result('REJECT', null, ['CREDIBILITY_REJECT']);
  }
  if (input.eligibility.state === 'DISQUALIFIED') {
    return result('REJECT', null, ['ELIGIBILITY_DISQUALIFIED']);
  }

  const criticalBudget = maxVerifiedUsdCents(input.pain, [
    'EXPLICIT_BUDGET',
    'FIXED_CONTRACT_VALUE',
    'BUDGET_RANGE',
  ]);
  if (criticalBudget !== null && criticalBudget >= CRITICAL_CENTS) {
    return result('P0_CRITICAL', 'BUDGET', ['VERIFIED_SEVEN_FIGURE_BUDGET']);
  }

  const recoverableLoss = maxVerifiedUsdCents(input.pain, ['RECOVERABLE_LOSS']);
  if (recoverableLoss !== null && recoverableLoss >= CRITICAL_CENTS) {
    return result('P0_CRITICAL', 'RECOVERABLE_LOSS', ['VERIFIED_SEVEN_FIGURE_RECOVERABLE_LOSS']);
  }

  if (input.candidate.ranking.priority === 'PRIORITY_0') {
    return result('P0', null, ['UPSTREAM_PRIORITY_0']);
  }

  const explicitBudget = maxVerifiedUsdCents(input.pain, ['EXPLICIT_BUDGET']);
  if (explicitBudget !== null
    && explicitBudget >= P0_BUDGET_CENTS
    && input.candidate.intent.score >= 0.7
    && input.candidate.credibility.credibilityScore >= 0.7) {
    return result('P0', null, ['VERIFIED_HIGH_VALUE_BUDGET']);
  }

  if (input.candidate.ranking.priority === 'STRONG') {
    return result('STRONG', null, ['UPSTREAM_STRONG']);
  }
  if (input.candidate.ranking.priority === 'MONITOR') {
    return result('MONITOR', null, ['UPSTREAM_MONITOR']);
  }
  return result('REJECT', null, ['UPSTREAM_REJECT']);
}
