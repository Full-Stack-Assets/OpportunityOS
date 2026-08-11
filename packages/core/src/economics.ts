export interface EconomicsInput {
  revenueCents?: number;
  costCents?: number;
}

export interface EconomicsResult {
  revenueCents: number | undefined;
  costCents: number | undefined;
  contributionCents: number | undefined;
  evidenceComplete: boolean;
}

function assertMoney(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new TypeError(`${label} must be a non-negative integer number of cents`);
  }
}

export function calculateEconomics(input: EconomicsInput): EconomicsResult {
  assertMoney(input.revenueCents, 'revenueCents');
  assertMoney(input.costCents, 'costCents');
  const evidenceComplete = input.revenueCents !== undefined && input.costCents !== undefined;
  return {
    revenueCents: input.revenueCents,
    costCents: input.costCents,
    contributionCents: evidenceComplete ? input.revenueCents! - input.costCents! : undefined,
    evidenceComplete,
  };
}
