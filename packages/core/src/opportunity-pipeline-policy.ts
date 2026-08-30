export type InboundSearchState =
  | 'NEW_INBOUND_ACTIVITY'
  | 'NO_MATCHING_INBOUND_ACTIVITY'
  | 'UNVERIFIED';

export type InboundFailureClass =
  | 'FAILED_PRECONDITION'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_FAILURE'
  | 'SCHEMA_DRIFT'
  | 'UNKNOWN_FAILURE';

export interface InboundSearchObservation {
  provider: string;
  attemptedAt: string;
  queryFingerprint: string;
  searchSucceeded: boolean;
  matchCount?: number;
  failureCode?: string;
  failureDetail?: string;
  evidenceRefs: string[];
}

export interface InboundSearchAssessment {
  provider: string;
  attemptedAt: string;
  queryFingerprint: string;
  state: InboundSearchState;
  verified: boolean;
  matchCount: number | null;
  failureClass: InboundFailureClass | null;
  failureCode: string | null;
  failureDetail: string | null;
  evidenceRefs: string[];
}

function nonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must be a non-blank string`);
  return normalized;
}

function unitInterval(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be between 0 and 1`);
  }
  return value;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
  return value;
}

function uniqueNonBlank(values: string[]): string[] {
  if (!Array.isArray(values)) throw new TypeError('expected an array of strings');
  return [...new Set(values.map((value) => nonBlank(value, 'array value')))];
}

function classifyInboundFailure(code: string | undefined, detail: string | undefined): InboundFailureClass {
  const combined = `${code ?? ''} ${detail ?? ''}`.trim().toLowerCase();
  if (combined.includes('failedprecondition') || combined.includes('failed_precondition')) {
    return 'FAILED_PRECONDITION';
  }
  if (
    combined.includes('unauthenticated')
    || combined.includes('authorization')
    || combined.includes('auth_required')
    || combined.includes('invalid_grant')
    || combined.includes('permission_denied')
  ) {
    return 'AUTH_REQUIRED';
  }
  if (combined.includes('rate') || combined.includes('429') || combined.includes('quota')) {
    return 'RATE_LIMITED';
  }
  if (combined.includes('schema') || combined.includes('parse') || combined.includes('malformed')) {
    return 'SCHEMA_DRIFT';
  }
  if (
    combined.includes('network')
    || combined.includes('timeout')
    || combined.includes('upstream')
    || combined.includes('5xx')
    || combined.includes('unavailable')
  ) {
    return 'UPSTREAM_FAILURE';
  }
  return 'UNKNOWN_FAILURE';
}

/**
 * Convert one provider search attempt into an explicit tri-state inbound result.
 * A failed search can never be interpreted as a verified zero-result search.
 */
export function classifyInboundSearch(input: InboundSearchObservation): InboundSearchAssessment {
  const provider = nonBlank(input.provider, 'provider');
  const queryFingerprint = nonBlank(input.queryFingerprint, 'queryFingerprint');
  if (!Number.isFinite(Date.parse(input.attemptedAt))) {
    throw new TypeError('attemptedAt must be an ISO-8601 timestamp');
  }
  const evidenceRefs = uniqueNonBlank(input.evidenceRefs);
  if (evidenceRefs.length === 0) throw new TypeError('inbound search evidence is required');

  if (input.searchSucceeded) {
    if (input.matchCount === undefined) {
      throw new TypeError('matchCount is required when searchSucceeded is true');
    }
    const matchCount = nonNegativeInteger(input.matchCount, 'matchCount');
    return {
      provider,
      attemptedAt: input.attemptedAt,
      queryFingerprint,
      state: matchCount > 0 ? 'NEW_INBOUND_ACTIVITY' : 'NO_MATCHING_INBOUND_ACTIVITY',
      verified: true,
      matchCount,
      failureClass: null,
      failureCode: null,
      failureDetail: null,
      evidenceRefs,
    };
  }

  return {
    provider,
    attemptedAt: input.attemptedAt,
    queryFingerprint,
    state: 'UNVERIFIED',
    verified: false,
    matchCount: null,
    failureClass: classifyInboundFailure(input.failureCode, input.failureDetail),
    failureCode: input.failureCode?.trim() || null,
    failureDetail: input.failureDetail?.trim() || null,
    evidenceRefs,
  };
}

export type PursuitTier =
  | 'STRONG_MATCH'
  | 'REALISTIC_CANDIDATE'
  | 'MODERATE_PLAUSIBLE'
  | 'REQUIRES_CLARIFICATION'
  | 'MONITORING_ONLY'
  | 'EXCLUDED';

export interface PursuitTierInput {
  eligibilityState: 'ELIGIBLE' | 'PARTIAL' | 'UNKNOWN' | 'DISQUALIFIED';
  winProbability: number | null;
  confidence: number;
  unresolvedClarifications: string[];
  hardExclusions: string[];
}

export interface PursuitTierAssessment {
  tier: PursuitTier;
  reasons: string[];
  unresolvedClarifications: string[];
  hardExclusions: string[];
}

/**
 * Surface plausible opportunities without weakening hard exclusions.
 * Unknown or adjacent evidence reduces tier/confidence instead of becoming an implicit rejection.
 */
export function classifyPursuitTier(input: PursuitTierInput): PursuitTierAssessment {
  unitInterval(input.confidence, 'confidence');
  if (input.winProbability !== null) unitInterval(input.winProbability, 'winProbability');
  const unresolvedClarifications = uniqueNonBlank(input.unresolvedClarifications);
  const hardExclusions = uniqueNonBlank(input.hardExclusions);

  if (input.eligibilityState === 'DISQUALIFIED' || hardExclusions.length > 0) {
    return {
      tier: 'EXCLUDED',
      reasons: [
        input.eligibilityState === 'DISQUALIFIED' ? 'ELIGIBILITY_DISQUALIFIED' : 'HARD_EXCLUSION',
        ...hardExclusions.map((value) => `EXCLUSION:${value}`),
      ],
      unresolvedClarifications,
      hardExclusions,
    };
  }

  if (unresolvedClarifications.length > 0) {
    return {
      tier: 'REQUIRES_CLARIFICATION',
      reasons: unresolvedClarifications.map((value) => `CLARIFY:${value}`),
      unresolvedClarifications,
      hardExclusions,
    };
  }

  const probability = input.winProbability;
  if (
    input.eligibilityState === 'ELIGIBLE'
    && probability !== null
    && probability >= 0.65
    && input.confidence >= 0.65
  ) {
    return {
      tier: 'STRONG_MATCH',
      reasons: ['ELIGIBLE_HIGH_WINABILITY'],
      unresolvedClarifications,
      hardExclusions,
    };
  }

  if (probability !== null && probability >= 0.45 && input.confidence >= 0.4) {
    return {
      tier: 'REALISTIC_CANDIDATE',
      reasons: [input.eligibilityState === 'PARTIAL' ? 'ADJACENT_OR_PARTIAL_EVIDENCE' : 'REALISTIC_WINABILITY'],
      unresolvedClarifications,
      hardExclusions,
    };
  }

  if (probability !== null && probability >= 0.2 && input.confidence >= 0.3) {
    return {
      tier: 'MODERATE_PLAUSIBLE',
      reasons: [input.eligibilityState === 'PARTIAL' ? 'PARTIAL_EVIDENCE_PLAUSIBLE' : 'MODERATE_WINABILITY'],
      unresolvedClarifications,
      hardExclusions,
    };
  }

  return {
    tier: 'MONITORING_ONLY',
    reasons: [probability === null ? 'WINABILITY_UNKNOWN' : 'LOW_OR_LOW_CONFIDENCE_WINABILITY'],
    unresolvedClarifications,
    hardExclusions,
  };
}

export type ConnectorRoute =
  | 'OFFICIAL_API'
  | 'APPROVED_CONNECTOR'
  | 'GOVERNED_BROWSER'
  | 'MANUAL_ONLY';

export interface ConnectorRouteInput {
  apiAvailable: boolean;
  apiSufficient: boolean;
  approvedConnectorAvailable?: boolean;
  approvedConnectorSufficient?: boolean;
  browserAvailable: boolean;
  browserAutomationPermitted: boolean;
}

export interface ConnectorRouteDecision {
  route: ConnectorRoute;
  requiresEscalation: boolean;
  reason: string;
}

/** Prefer the narrowest approved machine interface and never use browser fallback when platform policy forbids it. */
export function resolveConnectorRoute(input: ConnectorRouteInput): ConnectorRouteDecision {
  if (input.apiAvailable && input.apiSufficient) {
    return {route: 'OFFICIAL_API', requiresEscalation: false, reason: 'OFFICIAL_API_SUFFICIENT'};
  }
  if (input.approvedConnectorAvailable && input.approvedConnectorSufficient) {
    return {route: 'APPROVED_CONNECTOR', requiresEscalation: false, reason: 'APPROVED_CONNECTOR_SUFFICIENT'};
  }
  if (input.browserAvailable && input.browserAutomationPermitted) {
    return {route: 'GOVERNED_BROWSER', requiresEscalation: false, reason: 'APPROVED_MACHINE_INTERFACE_INSUFFICIENT'};
  }
  return {
    route: 'MANUAL_ONLY',
    requiresEscalation: true,
    reason: input.browserAvailable && !input.browserAutomationPermitted
      ? 'BROWSER_AUTOMATION_PROHIBITED'
      : 'NO_AUTHORIZED_WRITE_ROUTE',
  };
}

export type CompensationState = 'CONFIRMED' | 'UNKNOWN' | 'DISALLOWED';
export type LocationState = 'ALLOWED' | 'UNKNOWN' | 'DISALLOWED';
export type AutoApplyDecision = 'AUTO_SUBMIT' | 'PREPARE_ONLY' | 'ESCALATE' | 'DENY';

export interface AutoApplyCandidate {
  provider: string;
  listingCurrent: boolean;
  previouslyPursued: boolean;
  compensationState: CompensationState;
  compensationCents: number | null;
  locationState: LocationState;
  skillFit: number;
  winProbability: number;
  candidacyConfidence: number;
  applicationCostCents: number;
  unsupportedClaims: string[];
  requiredClarifications: string[];
  connectorCanSubmit: boolean;
  platformConfirmationRequired: boolean;
  submissionsToday: number;
  submissionsThisPlatformToday: number;
  evidenceRefs: string[];
}

export interface AutoApplyPolicyEnvelope {
  policyId: string;
  authorityVerified: boolean;
  enabled: boolean;
  allowedProviders: string[];
  minimumCompensationCents: number;
  minimumSkillFit: number;
  minimumWinProbability: number;
  minimumCandidacyConfidence: number;
  maximumApplicationCostCents: number;
  dailySubmissionLimit: number;
  perPlatformDailyLimit: number;
}

export interface AutoApplyAssessment {
  decision: AutoApplyDecision;
  policyId: string;
  reasons: string[];
}

function validateAutoApplyInputs(candidate: AutoApplyCandidate, policy: AutoApplyPolicyEnvelope): void {
  nonBlank(candidate.provider, 'provider');
  nonBlank(policy.policyId, 'policyId');
  unitInterval(candidate.skillFit, 'skillFit');
  unitInterval(candidate.winProbability, 'winProbability');
  unitInterval(candidate.candidacyConfidence, 'candidacyConfidence');
  unitInterval(policy.minimumSkillFit, 'minimumSkillFit');
  unitInterval(policy.minimumWinProbability, 'minimumWinProbability');
  unitInterval(policy.minimumCandidacyConfidence, 'minimumCandidacyConfidence');
  nonNegativeInteger(candidate.applicationCostCents, 'applicationCostCents');
  nonNegativeInteger(candidate.submissionsToday, 'submissionsToday');
  nonNegativeInteger(candidate.submissionsThisPlatformToday, 'submissionsThisPlatformToday');
  nonNegativeInteger(policy.minimumCompensationCents, 'minimumCompensationCents');
  nonNegativeInteger(policy.maximumApplicationCostCents, 'maximumApplicationCostCents');
  nonNegativeInteger(policy.dailySubmissionLimit, 'dailySubmissionLimit');
  nonNegativeInteger(policy.perPlatformDailyLimit, 'perPlatformDailyLimit');
  if (candidate.compensationCents !== null) nonNegativeInteger(candidate.compensationCents, 'compensationCents');
  uniqueNonBlank(candidate.evidenceRefs);
  uniqueNonBlank(candidate.unsupportedClaims);
  uniqueNonBlank(candidate.requiredClarifications);
  uniqueNonBlank(policy.allowedProviders);
}

/**
 * Pure policy decision only. AUTO_SUBMIT means the candidate is inside the pre-authorized envelope.
 * The actual provider write must still pass the Action Gateway, connector capability checks, and receipt capture.
 */
export function evaluateAutoApply(
  candidate: AutoApplyCandidate,
  policy: AutoApplyPolicyEnvelope,
): AutoApplyAssessment {
  validateAutoApplyInputs(candidate, policy);

  if (!candidate.listingCurrent) {
    return {decision: 'DENY', policyId: policy.policyId, reasons: ['LISTING_NOT_CURRENT']};
  }
  if (candidate.previouslyPursued) {
    return {decision: 'DENY', policyId: policy.policyId, reasons: ['ALREADY_PURSUED']};
  }
  if (candidate.compensationState === 'DISALLOWED') {
    return {decision: 'DENY', policyId: policy.policyId, reasons: ['COMPENSATION_DISALLOWED']};
  }
  if (candidate.locationState === 'DISALLOWED') {
    return {decision: 'DENY', policyId: policy.policyId, reasons: ['LOCATION_DISALLOWED']};
  }

  if (candidate.compensationState === 'UNKNOWN' || candidate.compensationCents === null) {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['COMPENSATION_UNVERIFIED']};
  }
  if (candidate.locationState === 'UNKNOWN') {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['LOCATION_UNVERIFIED']};
  }
  if (candidate.unsupportedClaims.length > 0) {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['UNSUPPORTED_APPLICATION_CLAIM']};
  }
  if (candidate.requiredClarifications.length > 0) {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['REQUIRED_CLARIFICATION']};
  }
  if (candidate.evidenceRefs.length === 0) {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['APPLICATION_EVIDENCE_MISSING']};
  }
  if (candidate.applicationCostCents > policy.maximumApplicationCostCents) {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['FINANCIAL_COMMITMENT_OUTSIDE_ENVELOPE']};
  }
  if (candidate.platformConfirmationRequired) {
    return {decision: 'ESCALATE', policyId: policy.policyId, reasons: ['PLATFORM_CONFIRMATION_REQUIRED']};
  }

  if (!policy.enabled || !policy.authorityVerified) {
    return {
      decision: 'PREPARE_ONLY',
      policyId: policy.policyId,
      reasons: [!policy.enabled ? 'AUTO_APPLY_DISABLED' : 'HUMAN_AUTHORITY_ENVELOPE_UNVERIFIED'],
    };
  }
  if (!policy.allowedProviders.includes(candidate.provider)) {
    return {decision: 'PREPARE_ONLY', policyId: policy.policyId, reasons: ['PROVIDER_OUTSIDE_POLICY']};
  }
  if (candidate.compensationCents < policy.minimumCompensationCents) {
    return {decision: 'DENY', policyId: policy.policyId, reasons: ['COMPENSATION_BELOW_POLICY_MINIMUM']};
  }
  if (!candidate.connectorCanSubmit) {
    return {decision: 'PREPARE_ONLY', policyId: policy.policyId, reasons: ['WRITE_CONNECTOR_UNAVAILABLE']};
  }
  if (
    candidate.submissionsToday >= policy.dailySubmissionLimit
    || candidate.submissionsThisPlatformToday >= policy.perPlatformDailyLimit
  ) {
    return {decision: 'PREPARE_ONLY', policyId: policy.policyId, reasons: ['SUBMISSION_LIMIT_REACHED']};
  }
  if (
    candidate.skillFit < policy.minimumSkillFit
    || candidate.winProbability < policy.minimumWinProbability
    || candidate.candidacyConfidence < policy.minimumCandidacyConfidence
  ) {
    return {decision: 'PREPARE_ONLY', policyId: policy.policyId, reasons: ['CANDIDACY_BELOW_AUTO_APPLY_THRESHOLD']};
  }

  return {decision: 'AUTO_SUBMIT', policyId: policy.policyId, reasons: ['WITHIN_AUTHORIZED_POLICY_ENVELOPE']};
}
