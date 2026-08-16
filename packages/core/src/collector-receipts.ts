import {hashCanonical} from './canonical.ts';
import type {DemandQueryFamilyId} from './demand-queries.ts';
import type {PublicDemandProvider} from './public-demand.ts';

export type CollectorHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'SCHEMA_DRIFT'
  | 'POLICY_BLOCKED';

export type CollectorCredentialMode = 'authenticated' | 'anonymous_public' | 'not_applicable';

export interface CollectorReceiptInput {
  collectorId: string;
  collectorVersion: string;
  provider: PublicDemandProvider;
  queryFamilyId: DemandQueryFamilyId;
  queryVersion: string;
  startedAt: string;
  completedAt: string;
  retrievalMethod: string;
  credentialMode: CollectorCredentialMode;
  healthBefore: CollectorHealthState;
  healthAfter: CollectorHealthState;
  recordsObserved: number;
  recordsVerified: number;
  recordsRejected: number;
  recordsDeduplicated: number;
  signalsEmitted: number;
  requestFingerprint: string;
  resultFingerprint: string;
  paginationState: string | null;
  failureCode: string | null;
  failureDetails: string | null;
  previousReceiptHash?: string;
}

export interface CollectorReceipt extends CollectorReceiptInput {
  receiptHash: string;
}

function assertNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-blank string`);
}

function assertIso(value: string, field: string): void {
  assertNonBlank(value, field);
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${field} must be an ISO-8601 timestamp`);
}

function assertCount(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
}

export function createCollectorReceipt(input: CollectorReceiptInput): CollectorReceipt {
  for (const [field, value] of [
    ['collectorId', input.collectorId],
    ['collectorVersion', input.collectorVersion],
    ['queryVersion', input.queryVersion],
    ['retrievalMethod', input.retrievalMethod],
    ['requestFingerprint', input.requestFingerprint],
    ['resultFingerprint', input.resultFingerprint],
  ] as const) assertNonBlank(value, field);

  if (!['authenticated', 'anonymous_public', 'not_applicable'].includes(input.credentialMode)) {
    throw new TypeError('credentialMode must be authenticated, anonymous_public, or not_applicable');
  }

  assertIso(input.startedAt, 'startedAt');
  assertIso(input.completedAt, 'completedAt');
  if (Date.parse(input.completedAt) < Date.parse(input.startedAt)) {
    throw new TypeError('completedAt must not precede startedAt');
  }

  for (const [field, value] of [
    ['recordsObserved', input.recordsObserved],
    ['recordsVerified', input.recordsVerified],
    ['recordsRejected', input.recordsRejected],
    ['recordsDeduplicated', input.recordsDeduplicated],
    ['signalsEmitted', input.signalsEmitted],
  ] as const) assertCount(value, field);

  if (input.recordsVerified > input.recordsObserved) throw new TypeError('recordsVerified cannot exceed recordsObserved');
  if (input.recordsRejected > input.recordsObserved) throw new TypeError('recordsRejected cannot exceed recordsObserved');
  if (input.recordsDeduplicated > input.recordsObserved) throw new TypeError('recordsDeduplicated cannot exceed recordsObserved');
  if (input.signalsEmitted > input.recordsVerified) throw new TypeError('signalsEmitted cannot exceed recordsVerified');

  if (input.previousReceiptHash !== undefined) assertNonBlank(input.previousReceiptHash, 'previousReceiptHash');
  if (input.paginationState !== null) assertNonBlank(input.paginationState, 'paginationState');
  if (input.failureCode !== null) assertNonBlank(input.failureCode, 'failureCode');
  if (input.failureDetails !== null) assertNonBlank(input.failureDetails, 'failureDetails');

  const payload: CollectorReceiptInput = {
    collectorId: input.collectorId,
    collectorVersion: input.collectorVersion,
    provider: input.provider,
    queryFamilyId: input.queryFamilyId,
    queryVersion: input.queryVersion,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    retrievalMethod: input.retrievalMethod,
    credentialMode: input.credentialMode,
    healthBefore: input.healthBefore,
    healthAfter: input.healthAfter,
    recordsObserved: input.recordsObserved,
    recordsVerified: input.recordsVerified,
    recordsRejected: input.recordsRejected,
    recordsDeduplicated: input.recordsDeduplicated,
    signalsEmitted: input.signalsEmitted,
    requestFingerprint: input.requestFingerprint,
    resultFingerprint: input.resultFingerprint,
    paginationState: input.paginationState,
    failureCode: input.failureCode,
    failureDetails: input.failureDetails,
    ...(input.previousReceiptHash === undefined ? {} : {previousReceiptHash: input.previousReceiptHash}),
  };

  return {...payload, receiptHash: hashCanonical(payload)};
}
