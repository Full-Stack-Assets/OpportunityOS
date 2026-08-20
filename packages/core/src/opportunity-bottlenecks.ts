import {hashCanonical} from './canonical.ts';
import {createApplicationIdempotencyKey} from './connector-execution.ts';
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

function sortedUniqueNonBlank(values: string[], field: string): string[] {
  return uniqueNonBlank(values, field).sort();
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

export interface MarketplaceApplicationPreparationInput {
  provider: string;
  opportunityId: string;
  providerOpportunityId: string;
  listingFingerprint: string;
  proposalText: string;
  attachmentHashes: string[];
  requiredFieldAnswers: Record<string, string>;
  actionIntentId: string;
  evidenceRefs: string[];
  unsupportedClaims: string[];
  requiredClarifications: string[];
}

export interface PreparedMarketplaceApplicationPackage {
  provider: string;
  opportunityId: string;
  providerOpportunityId: string;
  listingFingerprint: string;
  proposalText: string;
  proposalTextHash: string;
  attachmentHashes: string[];
  requiredFieldAnswers: Record<string, string>;
  actionIntentId: string;
  evidenceRefs: string[];
  packageHash: string;
  idempotencyKey: string;
}

export type MarketplaceApplicationPreparationResult =
  | {
      state: 'PREPARED';
      submissionAllowed: false;
      reasons: [];
      package: PreparedMarketplaceApplicationPackage;
    }
  | {
      state: 'NEEDS_REVIEW';
      submissionAllowed: false;
      reasons: string[];
      package: null;
    };

function normalizeRequiredFieldAnswers(value: Record<string, string>): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('requiredFieldAnswers must be an object');
  }
  const normalized: Record<string, string> = {};
  for (const [key, answer] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const normalizedKey = nonBlank(key, 'requiredFieldAnswers key');
    normalized[normalizedKey] = nonBlank(answer, `requiredFieldAnswers.${normalizedKey}`);
  }
  return normalized;
}

/**
 * Prepare a provider-neutral application package without granting submission authority.
 * This is the safe path for providers whose final write route is unavailable, manual-only,
 * confirmation-required, or awaiting provider permission. Unsupported claims and unresolved
 * required facts fail closed into NEEDS_REVIEW rather than entering a provider payload.
 */
export function prepareMarketplaceApplicationPackage(
  input: MarketplaceApplicationPreparationInput,
): MarketplaceApplicationPreparationResult {
  const provider = nonBlank(input.provider, 'provider');
  const opportunityId = nonBlank(input.opportunityId, 'opportunityId');
  const providerOpportunityId = nonBlank(input.providerOpportunityId, 'providerOpportunityId');
  const listingFingerprint = nonBlank(input.listingFingerprint, 'listingFingerprint');
  const proposalText = nonBlank(input.proposalText, 'proposalText');
  const actionIntentId = nonBlank(input.actionIntentId, 'actionIntentId');
  const attachmentHashes = sortedUniqueNonBlank(input.attachmentHashes, 'attachmentHashes');
  const evidenceRefs = sortedUniqueNonBlank(input.evidenceRefs, 'evidenceRefs');
  const unsupportedClaims = sortedUniqueNonBlank(input.unsupportedClaims, 'unsupportedClaims');
  const requiredClarifications = sortedUniqueNonBlank(input.requiredClarifications, 'requiredClarifications');
  const requiredFieldAnswers = normalizeRequiredFieldAnswers(input.requiredFieldAnswers);

  const reasons: string[] = [];
  if (unsupportedClaims.length > 0) reasons.push('UNSUPPORTED_CLAIM');
  if (requiredClarifications.length > 0) reasons.push('REQUIRED_CLARIFICATION');
  if (evidenceRefs.length === 0) reasons.push('EVIDENCE_REQUIRED');
  if (reasons.length > 0) {
    return {state: 'NEEDS_REVIEW', submissionAllowed: false, reasons, package: null};
  }

  const proposalTextHash = hashCanonical(proposalText);
  const packageBody = {
    provider,
    opportunityId,
    providerOpportunityId,
    listingFingerprint,
    proposalText,
    proposalTextHash,
    attachmentHashes,
    requiredFieldAnswers,
    actionIntentId,
    evidenceRefs,
  };
  const packageHash = hashCanonical(packageBody);
  const idempotencyKey = createApplicationIdempotencyKey({
    provider,
    providerOpportunityId,
    listingFingerprint,
    packageHash,
    actionIntentId,
  });

  return {
    state: 'PREPARED',
    submissionAllowed: false,
    reasons: [],
    package: {...packageBody, packageHash, idempotencyKey},
  };
}
