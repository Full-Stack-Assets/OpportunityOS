import type {CommercialPriority} from './commercial-priority.ts';

export type RevalidationState = 'CURRENT' | 'REVALIDATION_DUE' | 'STALE' | 'INVALIDATED';

export interface RevalidationAssessment {
  state: RevalidationState;
  ageMs: number;
  revalidateAfterMs: number | null;
  dueAt: string | null;
  reasons: string[];
  evidenceRefs: string[];
}

const TTL_MS: Record<CommercialPriority, number | null> = {
  P0_CRITICAL: 6 * 60 * 60 * 1000,
  P0: 24 * 60 * 60 * 1000,
  STRONG: 72 * 60 * 60 * 1000,
  MONITOR: 7 * 24 * 60 * 60 * 1000,
  REJECT: null,
};

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`REVALIDATION_TIMESTAMP_INVALID:${field}`);
  return parsed;
}

function normalizedRefs(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

export function assessOpportunityRevalidation(input: {
  priority: CommercialPriority;
  retrievedAt: string;
  lastRevalidatedAt: string | null;
  now: string;
  originalContentFingerprint: string;
  currentContentFingerprint: string | null;
  sourceStillActive: boolean | null;
  revalidationEvidenceRefs: string[];
}): RevalidationAssessment {
  const retrievedAt = parseTimestamp(input.retrievedAt, 'retrievedAt');
  const now = parseTimestamp(input.now, 'now');
  const evidenceRefs = normalizedRefs(input.revalidationEvidenceRefs);

  let baseline = retrievedAt;
  if (input.lastRevalidatedAt !== null) {
    if (evidenceRefs.length === 0) throw new TypeError('REVALIDATION_EVIDENCE_REQUIRED');
    baseline = parseTimestamp(input.lastRevalidatedAt, 'lastRevalidatedAt');
  }
  if (baseline > now) throw new TypeError('REVALIDATION_TIMESTAMP_INVALID:FUTURE_BASELINE');

  const ageMs = now - baseline;
  const revalidateAfterMs = TTL_MS[input.priority];
  const dueAt = revalidateAfterMs === null ? null : new Date(baseline + revalidateAfterMs).toISOString();

  if (input.sourceStillActive === false) {
    if (evidenceRefs.length === 0) throw new TypeError('REVALIDATION_EVIDENCE_REQUIRED');
    return {
      state: 'INVALIDATED',
      ageMs,
      revalidateAfterMs,
      dueAt,
      reasons: ['SOURCE_INACTIVE'],
      evidenceRefs,
    };
  }

  if (input.currentContentFingerprint !== null
    && input.currentContentFingerprint !== input.originalContentFingerprint) {
    if (evidenceRefs.length === 0) throw new TypeError('REVALIDATION_EVIDENCE_REQUIRED');
    return {
      state: 'STALE',
      ageMs,
      revalidateAfterMs,
      dueAt,
      reasons: ['CONTENT_CHANGED'],
      evidenceRefs,
    };
  }

  if (revalidateAfterMs !== null && ageMs > revalidateAfterMs) {
    return {
      state: 'REVALIDATION_DUE',
      ageMs,
      revalidateAfterMs,
      dueAt,
      reasons: ['REVALIDATION_WINDOW_EXCEEDED'],
      evidenceRefs,
    };
  }

  return {
    state: 'CURRENT',
    ageMs,
    revalidateAfterMs,
    dueAt,
    reasons: input.sourceStillActive === null ? ['SOURCE_ACTIVITY_UNKNOWN'] : [],
    evidenceRefs,
  };
}
