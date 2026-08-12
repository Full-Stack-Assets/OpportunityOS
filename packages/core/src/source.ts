export interface MarketplaceOpportunityEvidence {
  platform: string;
  platform_id: string;
  title: string;
  description: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  bid_count: number | null;
  skills: string[];
  employer_id: string | null;
  deadline: string | number | null;
  source_url: string;
  retrieved_at: string;
  retrieval_method: string;
  verified: boolean;
  raw_source: string;
}

export interface VerifiedMarketplaceOpportunityEvidence extends MarketplaceOpportunityEvidence {
  verified: true;
}

function assertNonBlankString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-blank string`);
  }
}

function assertNullableString(value: unknown, field: string): asserts value is string | null {
  if (value === null) return;
  assertNonBlankString(value, field);
}

function assertNullableNonNegativeNumber(value: unknown, field: string): asserts value is number | null {
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be null or a non-negative finite number`);
  }
}

function assertNullableNonNegativeInteger(value: unknown, field: string): asserts value is number | null {
  if (value === null) return;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${field} must be null or a non-negative integer`);
  }
}

export function assertVerifiedMarketplaceOpportunityEvidence(
  value: MarketplaceOpportunityEvidence,
): asserts value is VerifiedMarketplaceOpportunityEvidence {
  if (value.verified !== true) throw new TypeError('verified source evidence required');

  for (const [field, item] of [
    ['platform', value.platform],
    ['platform_id', value.platform_id],
    ['title', value.title],
    ['source_url', value.source_url],
    ['retrieved_at', value.retrieved_at],
    ['retrieval_method', value.retrieval_method],
    ['raw_source', value.raw_source],
  ] as const) {
    assertNonBlankString(item, field);
  }

  if (!Number.isFinite(Date.parse(value.retrieved_at))) {
    throw new TypeError('retrieved_at must be an ISO-8601 timestamp');
  }

  assertNullableString(value.description, 'description');
  assertNullableString(value.currency, 'currency');
  assertNullableString(value.employer_id, 'employer_id');
  assertNullableNonNegativeNumber(value.budget_min, 'budget_min');
  assertNullableNonNegativeNumber(value.budget_max, 'budget_max');
  assertNullableNonNegativeInteger(value.bid_count, 'bid_count');

  if (
    value.deadline !== null &&
    !(
      (typeof value.deadline === 'string' && value.deadline.trim().length > 0) ||
      (typeof value.deadline === 'number' && Number.isFinite(value.deadline) && value.deadline >= 0)
    )
  ) {
    throw new TypeError('deadline must be null, a non-blank string, or a non-negative finite number');
  }

  if (!Array.isArray(value.skills) || value.skills.some((skill) => typeof skill !== 'string' || skill.trim().length === 0)) {
    throw new TypeError('skills must contain only non-blank strings');
  }
}

export function marketplaceEvidenceId(evidence: MarketplaceOpportunityEvidence): string {
  assertVerifiedMarketplaceOpportunityEvidence(evidence);
  return `${evidence.platform}:${evidence.platform_id}`;
}
