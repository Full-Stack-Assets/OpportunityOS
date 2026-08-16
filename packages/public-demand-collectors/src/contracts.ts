import {
  createCollectorReceipt,
  hashCanonical,
  type CollectorCredentialMode,
  type CollectorHealthState,
  type CollectorReceipt,
  type DemandQueryFamilyId,
  type RawPublicDemandObservation,
} from '@opportunityos/core';

export type CollectorProvider = 'github_issues' | 'hacker_news';
export type CollectorFetch = typeof fetch;

export interface AttributedPublicDemandObservation extends RawPublicDemandObservation {
  queryFamilyId: DemandQueryFamilyId;
  queryVersion: string;
  sourceMetadata: Record<string, unknown>;
}

export interface CollectorHealth {
  provider: CollectorProvider;
  state: CollectorHealthState;
  checkedAt: string;
  detail: string | null;
}

export interface CollectorRejectedRecord {
  sourceId: string | null;
  reason: string;
}

export interface CollectorRunResult {
  observations: AttributedPublicDemandObservation[];
  receipt: CollectorReceipt;
  health: CollectorHealth;
  rejected: CollectorRejectedRecord[];
}

export interface CollectorRunFailureInput {
  provider: CollectorProvider;
  state: Exclude<CollectorHealthState, 'HEALTHY'>;
  checkedAt: string;
  detail: string;
  familyId: DemandQueryFamilyId;
  queryVersion: string;
  collectorId: string;
  collectorVersion: string;
  credentialMode?: CollectorCredentialMode;
  retrievalMethod?: string;
  previousReceiptHash?: string;
  requestContext?: unknown;
}

function assertIsoTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError('checkedAt must be an ISO-8601 timestamp');
}

export function createCollectorRunFailure(input: CollectorRunFailureInput): CollectorRunResult {
  assertIsoTimestamp(input.checkedAt);
  const credentialMode = input.credentialMode ?? 'not_applicable';
  const retrievalMethod = input.retrievalMethod ?? 'official_api';
  const requestFingerprint = hashCanonical({
    collectorId: input.collectorId,
    provider: input.provider,
    familyId: input.familyId,
    queryVersion: input.queryVersion,
    requestContext: input.requestContext ?? null,
  });
  const resultFingerprint = hashCanonical({
    provider: input.provider,
    state: input.state,
    observations: [],
    rejected: [],
    failure: input.detail,
  });
  const receipt = createCollectorReceipt({
    collectorId: input.collectorId,
    collectorVersion: input.collectorVersion,
    provider: input.provider,
    queryFamilyId: input.familyId,
    queryVersion: input.queryVersion,
    startedAt: input.checkedAt,
    completedAt: input.checkedAt,
    retrievalMethod,
    credentialMode,
    healthBefore: input.state,
    healthAfter: input.state,
    recordsObserved: 0,
    recordsVerified: 0,
    recordsRejected: 0,
    recordsDeduplicated: 0,
    signalsEmitted: 0,
    requestFingerprint,
    resultFingerprint,
    paginationState: null,
    failureCode: input.state,
    failureDetails: input.detail,
    ...(input.previousReceiptHash === undefined ? {} : {previousReceiptHash: input.previousReceiptHash}),
  });
  return {
    observations: [],
    receipt,
    health: {
      provider: input.provider,
      state: input.state,
      checkedAt: input.checkedAt,
      detail: input.detail,
    },
    rejected: [],
  };
}
