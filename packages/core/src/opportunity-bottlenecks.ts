import type {
  AutoApplyPolicyEnvelope,
  InboundSearchAssessment,
  InboundSearchState,
} from './opportunity-pipeline-policy.ts';

export type InboundCoverageState =
  | 'PRIMARY_VERIFIED'
  | 'DEGRADED_VERIFIED_FALLBACK'
  | 'UNVERIFIED';

export interface InboundCoverageAssessment {
  preferredProviders: string[];
  primaryProvider: string;
  primaryState: InboundSearchState;
  effectiveProvider: string | null;
  effectiveState: InboundSearchState;
  coverageState: InboundCoverageState;
  fullyVerified: boolean;
  assessments: InboundSearchAssessment[];
}

function nonBlank(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-blank string`);
  }
  return value.trim();
}

function uniqueNonBlank(values: string[], field: string): string[] {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  return [...new Set(values.map((value) => nonBlank(value, field)))];
}

/**
 * Resolve effective inbound coverage without laundering a failed primary mailbox
 * into a verified negative. A verified fallback can preserve operational coverage,
 * but the primary mailbox remains explicitly UNVERIFIED until it succeeds itself.
 */
export function resolveInboundCoverage(
  assessments: InboundSearchAssessment[],
  preferredProviders: string[],
): InboundCoverageAssessment {
  if (!Array.isArray(assessments)) throw new TypeError('assessments must be an array');
  const preferred = uniqueNonBlank(preferredProviders, 'preferredProviders');
  if (preferred.length === 0) throw new TypeError('preferredProviders must not be empty');

  const byProvider = new Map<string, InboundSearchAssessment>();
  for (const assessment of assessments) {
    const provider = nonBlank(assessment.provider, 'assessment.provider');
    if (!byProvider.has(provider)) byProvider.set(provider, assessment);
  }

  const primaryProvider = preferred[0]!;
  const primary = byProvider.get(primaryProvider);
  const primaryState: InboundSearchState = primary?.state ?? 'UNVERIFIED';

  if (primary?.verified === true) {
    return {
      preferredProviders: preferred,
      primaryProvider,
      primaryState,
      effectiveProvider: primaryProvider,
      effectiveState: primary.state,
      coverageState: 'PRIMARY_VERIFIED',
      fullyVerified: true,
      assessments: [...assessments],
    };
  }

  for (const provider of preferred.slice(1)) {
    const fallback = byProvider.get(provider);
    if (fallback?.verified === true) {
      return {
        preferredProviders: preferred,
        primaryProvider,
        primaryState,
        effectiveProvider: provider,
        effectiveState: fallback.state,
        coverageState: 'DEGRADED_VERIFIED_FALLBACK',
        fullyVerified: false,
        assessments: [...assessments],
      };
    }
  }

  return {
    preferredProviders: preferred,
    primaryProvider,
    primaryState,
    effectiveProvider: null,
    effectiveState: 'UNVERIFIED',
    coverageState: 'UNVERIFIED',
    fullyVerified: false,
    assessments: [...assessments],
  };
}

export type AutoApplyPolicyConfigStatus = 'DRAFT' | 'AUTHORIZED';

export interface AutoApplyPolicyConfig {
  policyId: string;
  status: AutoApplyPolicyConfigStatus;
  authorityRef: string | null;
  enabled: boolean;
  allowedProviders: string[];
  minimumCompensationCents: number | null;
  minimumSkillFit: number | null;
  minimumWinProbability: number | null;
  minimumCandidacyConfidence: number | null;
  maximumApplicationCostCents: number | null;
  dailySubmissionLimit: number | null;
  perPlatformDailyLimit: number | null;
}

export type AutoApplyPolicyMaterialization =
  | {
      state: 'AUTHORIZED';
      envelope: AutoApplyPolicyEnvelope;
      authorityRef: string;
      missingFields: [];
    }
  | {
      state: 'NOT_AUTHORIZED';
      envelope: null;
      authorityRef: string | null;
      missingFields: string[];
    };

/** Create a deliberately non-executable policy document with no invented thresholds. */
export function createDraftAutoApplyPolicyConfig(policyId: string): AutoApplyPolicyConfig {
  return {
    policyId: nonBlank(policyId, 'policyId'),
    status: 'DRAFT',
    authorityRef: null,
    enabled: false,
    allowedProviders: [],
    minimumCompensationCents: null,
    minimumSkillFit: null,
    minimumWinProbability: null,
    minimumCandidacyConfidence: null,
    maximumApplicationCostCents: null,
    dailySubmissionLimit: null,
    perPlatformDailyLimit: null,
  };
}

function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be between 0 and 1`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
}

function missingPolicyFields(config: AutoApplyPolicyConfig): string[] {
  const missing: string[] = [];
  if (config.status !== 'AUTHORIZED') missing.push('status');
  if (config.authorityRef === null || config.authorityRef.trim().length === 0) missing.push('authorityRef');
  if (!config.enabled) missing.push('enabled');
  if (!Array.isArray(config.allowedProviders) || config.allowedProviders.length === 0) missing.push('allowedProviders');

  for (const field of [
    'minimumCompensationCents',
    'minimumSkillFit',
    'minimumWinProbability',
    'minimumCandidacyConfidence',
    'maximumApplicationCostCents',
    'dailySubmissionLimit',
    'perPlatformDailyLimit',
  ] as const) {
    if (config[field] === null) missing.push(field);
  }
  return missing;
}

/**
 * Convert a Human Authority policy record into the existing executable envelope.
 * Incomplete or merely drafted policy can never be materialized as authority.
 */
export function materializeAutoApplyPolicyEnvelope(
  config: AutoApplyPolicyConfig,
): AutoApplyPolicyMaterialization {
  nonBlank(config.policyId, 'policyId');
  const missingFields = missingPolicyFields(config);
  if (missingFields.length > 0) {
    return {
      state: 'NOT_AUTHORIZED',
      envelope: null,
      authorityRef: config.authorityRef?.trim() || null,
      missingFields,
    };
  }

  const authorityRef = nonBlank(config.authorityRef!, 'authorityRef');
  const allowedProviders = uniqueNonBlank(config.allowedProviders, 'allowedProviders');
  const minimumCompensationCents = config.minimumCompensationCents!;
  const minimumSkillFit = config.minimumSkillFit!;
  const minimumWinProbability = config.minimumWinProbability!;
  const minimumCandidacyConfidence = config.minimumCandidacyConfidence!;
  const maximumApplicationCostCents = config.maximumApplicationCostCents!;
  const dailySubmissionLimit = config.dailySubmissionLimit!;
  const perPlatformDailyLimit = config.perPlatformDailyLimit!;

  assertNonNegativeInteger(minimumCompensationCents, 'minimumCompensationCents');
  assertUnitInterval(minimumSkillFit, 'minimumSkillFit');
  assertUnitInterval(minimumWinProbability, 'minimumWinProbability');
  assertUnitInterval(minimumCandidacyConfidence, 'minimumCandidacyConfidence');
  assertNonNegativeInteger(maximumApplicationCostCents, 'maximumApplicationCostCents');
  assertNonNegativeInteger(dailySubmissionLimit, 'dailySubmissionLimit');
  assertNonNegativeInteger(perPlatformDailyLimit, 'perPlatformDailyLimit');

  return {
    state: 'AUTHORIZED',
    authorityRef,
    missingFields: [],
    envelope: {
      policyId: config.policyId.trim(),
      authorityVerified: true,
      enabled: true,
      allowedProviders,
      minimumCompensationCents,
      minimumSkillFit,
      minimumWinProbability,
      minimumCandidacyConfidence,
      maximumApplicationCostCents,
      dailySubmissionLimit,
      perPlatformDailyLimit,
    },
  };
}
