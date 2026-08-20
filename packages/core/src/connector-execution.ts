import {hashCanonical} from './canonical.ts';

export type ConnectorOperation =
  | 'DISCOVER'
  | 'READ_INBOX'
  | 'PREPARE_APPLICATION'
  | 'UPLOAD_ATTACHMENT'
  | 'SUBMIT_APPLICATION'
  | 'RESPOND_MESSAGE';

export type ConnectorOperationMode =
  | 'SUPPORTED'
  | 'PREPARE_ONLY'
  | 'CONFIRMATION_REQUIRED'
  | 'UNAVAILABLE'
  | 'PROHIBITED';

export type ConnectorAuthenticationMode =
  | 'OAUTH2'
  | 'API_TOKEN'
  | 'SESSION'
  | 'CONNECTOR_MANAGED'
  | 'NONE';

export type ConnectorHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'RATE_LIMITED'
  | 'SCHEMA_DRIFT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'POLICY_PROHIBITED'
  | 'UNVERIFIED';

export interface ConnectorCapabilityManifest {
  provider: string;
  adapterVersion: string;
  authenticationMode: ConnectorAuthenticationMode;
  browserAutomationPermitted: boolean;
  lastVerifiedAt: string;
  policyEvidenceRefs: string[];
  operations: Record<ConnectorOperation, ConnectorOperationMode>;
}

export interface ConnectorOperationCapability {
  provider: string;
  operation: ConnectorOperation;
  mode: ConnectorOperationMode;
  machineExecutable: boolean;
  requiresEscalation: boolean;
  browserAutomationPermitted: boolean;
  policyEvidenceRefs: string[];
  adapterVersion: string;
  lastVerifiedAt: string;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must be a non-blank string`);
  return normalized;
}

function uniqueRefs(refs: string[]): string[] {
  if (!Array.isArray(refs)) throw new TypeError('policyEvidenceRefs must be an array');
  const normalized = [...new Set(refs.map((ref) => requiredText(ref, 'policyEvidenceRef')))];
  if (normalized.length === 0) throw new TypeError('policyEvidenceRefs must not be empty');
  return normalized;
}

function validTimestamp(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${field} must be a valid timestamp`);
  return value;
}

export function resolveConnectorOperationCapability(
  manifest: ConnectorCapabilityManifest,
  operation: ConnectorOperation,
): ConnectorOperationCapability {
  const provider = requiredText(manifest.provider, 'provider');
  const adapterVersion = requiredText(manifest.adapterVersion, 'adapterVersion');
  const policyEvidenceRefs = uniqueRefs(manifest.policyEvidenceRefs);
  validTimestamp(manifest.lastVerifiedAt, 'lastVerifiedAt');
  const mode = manifest.operations[operation];
  if (!mode) throw new TypeError(`operation ${operation} is missing from connector manifest`);

  const machineExecutable = mode === 'SUPPORTED';
  const requiresEscalation = mode !== 'SUPPORTED' && mode !== 'PREPARE_ONLY';

  return {
    provider,
    operation,
    mode,
    machineExecutable,
    requiresEscalation,
    browserAutomationPermitted: manifest.browserAutomationPermitted,
    policyEvidenceRefs,
    adapterVersion,
    lastVerifiedAt: manifest.lastVerifiedAt,
  };
}

export interface ApplicationIdempotencyInput {
  provider: string;
  providerOpportunityId: string;
  listingFingerprint: string;
  packageHash: string;
  actionIntentId: string;
}

/**
 * Stable key for duplicate-safe application execution. Any material target or package drift changes the key.
 */
export function createApplicationIdempotencyKey(input: ApplicationIdempotencyInput): string {
  const body = {
    provider: requiredText(input.provider, 'provider'),
    providerOpportunityId: requiredText(input.providerOpportunityId, 'providerOpportunityId'),
    listingFingerprint: requiredText(input.listingFingerprint, 'listingFingerprint'),
    packageHash: requiredText(input.packageHash, 'packageHash'),
    actionIntentId: requiredText(input.actionIntentId, 'actionIntentId'),
  };
  return `application:${hashCanonical(body)}`;
}

export type ConnectorFailureClass =
  | 'RATE_LIMITED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'TRANSIENT_UPSTREAM'
  | 'INVALID_INPUT'
  | 'SCHEMA_DRIFT'
  | 'POLICY_PROHIBITED'
  | 'CONFIRMATION_REQUIRED'
  | 'UNKNOWN_WRITE_OUTCOME'
  | 'UNKNOWN_FAILURE';

export type RetryDisposition =
  | 'BOUNDED_RETRY'
  | 'REFRESH_OR_ESCALATE'
  | 'REPAIR_INPUT'
  | 'DISABLE_CAPABILITY'
  | 'RECONCILE_BEFORE_RETRY'
  | 'DO_NOT_RETRY';

export interface ConnectorFailureObservation {
  operation: ConnectorOperation;
  statusCode?: number;
  code?: string;
  detail?: string;
  outcomeKnown: boolean;
}

export interface ConnectorFailureAssessment {
  operation: ConnectorOperation;
  failureClass: ConnectorFailureClass;
  retryDisposition: RetryDisposition;
  requiresEscalation: boolean;
  outcomeKnown: boolean;
}

function isWriteOperation(operation: ConnectorOperation): boolean {
  return operation === 'UPLOAD_ATTACHMENT'
    || operation === 'SUBMIT_APPLICATION'
    || operation === 'RESPOND_MESSAGE';
}

function normalizedFailureText(input: ConnectorFailureObservation): string {
  return `${input.code ?? ''} ${input.detail ?? ''}`.trim().toLowerCase();
}

/**
 * Classify connector/runtime failures without conflating a timed-out write with a failed write.
 * Unknown outcomes on provider writes must be reconciled before any retry.
 */
export function classifyConnectorFailure(input: ConnectorFailureObservation): ConnectorFailureAssessment {
  const text = normalizedFailureText(input);

  if (isWriteOperation(input.operation) && !input.outcomeKnown) {
    return {
      operation: input.operation,
      failureClass: 'UNKNOWN_WRITE_OUTCOME',
      retryDisposition: 'RECONCILE_BEFORE_RETRY',
      requiresEscalation: true,
      outcomeKnown: false,
    };
  }

  if (
    input.statusCode === 429
    || text.includes('rate_limit')
    || text.includes('rate limited')
    || text.includes('too many requests')
    || text.includes('quota')
  ) {
    return {
      operation: input.operation,
      failureClass: 'RATE_LIMITED',
      retryDisposition: 'BOUNDED_RETRY',
      requiresEscalation: false,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (
    input.statusCode === 401
    || text.includes('auth_required')
    || text.includes('unauthenticated')
    || text.includes('invalid_grant')
    || text.includes('expired token')
  ) {
    return {
      operation: input.operation,
      failureClass: 'AUTH_REQUIRED',
      retryDisposition: 'REFRESH_OR_ESCALATE',
      requiresEscalation: true,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (
    input.statusCode === 403
    || text.includes('permission_required')
    || text.includes('permission denied')
    || text.includes('not approved')
  ) {
    return {
      operation: input.operation,
      failureClass: 'PERMISSION_REQUIRED',
      retryDisposition: 'DO_NOT_RETRY',
      requiresEscalation: true,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (text.includes('policy_prohibited') || text.includes('automation not permitted') || text.includes('prohibited')) {
    return {
      operation: input.operation,
      failureClass: 'POLICY_PROHIBITED',
      retryDisposition: 'DO_NOT_RETRY',
      requiresEscalation: true,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (text.includes('confirmation_required') || text.includes('explicit approval required')) {
    return {
      operation: input.operation,
      failureClass: 'CONFIRMATION_REQUIRED',
      retryDisposition: 'DO_NOT_RETRY',
      requiresEscalation: true,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (text.includes('schema') || text.includes('dom drift') || text.includes('parse error')) {
    return {
      operation: input.operation,
      failureClass: 'SCHEMA_DRIFT',
      retryDisposition: 'DISABLE_CAPABILITY',
      requiresEscalation: true,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (
    (input.statusCode !== undefined && input.statusCode >= 500)
    || text.includes('network')
    || text.includes('timeout')
    || text.includes('temporarily unavailable')
    || text.includes('upstream')
  ) {
    return {
      operation: input.operation,
      failureClass: 'TRANSIENT_UPSTREAM',
      retryDisposition: 'BOUNDED_RETRY',
      requiresEscalation: false,
      outcomeKnown: input.outcomeKnown,
    };
  }

  if (
    input.statusCode === 400
    || input.statusCode === 422
    || text.includes('invalid_input')
    || text.includes('validation')
  ) {
    return {
      operation: input.operation,
      failureClass: 'INVALID_INPUT',
      retryDisposition: 'REPAIR_INPUT',
      requiresEscalation: false,
      outcomeKnown: input.outcomeKnown,
    };
  }

  return {
    operation: input.operation,
    failureClass: 'UNKNOWN_FAILURE',
    retryDisposition: 'DO_NOT_RETRY',
    requiresEscalation: true,
    outcomeKnown: input.outcomeKnown,
  };
}

export interface CanonicalApplicationExecutionRequest {
  opportunityId: string;
  provider: string;
  providerOpportunityId: string;
  listingFingerprint: string;
  policyId: string;
  actionIntentId: string;
  packageHash: string;
  proposalTextHash: string;
  attachmentHashes: string[];
  compensationSnapshot: unknown;
  locationSnapshot: unknown;
  candidacySnapshot: unknown;
  applicationCostSnapshot: unknown;
  connectorRoute: 'OFFICIAL_API' | 'APPROVED_CONNECTOR' | 'GOVERNED_BROWSER' | 'MANUAL_ONLY';
  authorityRef: string;
  evidenceRefs: string[];
}

export interface ProviderActionReceiptEvidence {
  provider: string;
  providerSubmissionId: string | null;
  providerThreadId: string | null;
  connectorRoute: CanonicalApplicationExecutionRequest['connectorRoute'];
  adapterVersion: string;
  outcome: 'SUCCESS' | 'VERIFIED_NOOP' | 'FAILED' | 'UNKNOWN_OUTCOME' | 'ESCALATED';
  verificationMethod: string;
  amountCommittedCents: number;
  creditsCommitted: number;
  evidenceRefs: string[];
}
