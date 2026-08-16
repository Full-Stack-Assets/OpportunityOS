export type EligibilityCheckKind =
  | 'BUYER_LEGITIMACY'
  | 'GEOGRAPHY'
  | 'QUALIFICATION'
  | 'DEADLINE'
  | 'CAPABILITY_PROOF';

export type EligibilityCheckState = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface EligibilityCheck {
  kind: EligibilityCheckKind;
  state: EligibilityCheckState;
  statement: string;
  hardDisqualifier: boolean;
  evidenceRefs: string[];
}

export interface EligibilityAssessment {
  state: 'ELIGIBLE' | 'PARTIAL' | 'UNKNOWN' | 'DISQUALIFIED';
  checks: EligibilityCheck[];
  hardDisqualifiers: string[];
  missingEvidence: string[];
  evidenceRefs: string[];
}

const ALL_CHECK_KINDS: EligibilityCheckKind[] = [
  'BUYER_LEGITIMACY',
  'GEOGRAPHY',
  'QUALIFICATION',
  'DEADLINE',
  'CAPABILITY_PROOF',
];

function requireEvidence(check: EligibilityCheck): void {
  if (check.state === 'UNKNOWN') return;
  if (!check.evidenceRefs.some((ref) => ref.trim().length > 0)) {
    throw new TypeError(`ELIGIBILITY_EVIDENCE_REQUIRED:${check.kind}`);
  }
}

function normalizedCheck(check: EligibilityCheck): EligibilityCheck {
  const statement = check.statement.trim();
  if (!statement) throw new TypeError(`ELIGIBILITY_STATEMENT_REQUIRED:${check.kind}`);
  requireEvidence(check);
  return {
    ...check,
    statement,
    evidenceRefs: [...new Set(check.evidenceRefs.filter((ref) => ref.trim().length > 0))].sort(),
  };
}

export function assessCommercialEligibility(checks: EligibilityCheck[]): EligibilityAssessment {
  if (!Array.isArray(checks)) throw new TypeError('ELIGIBILITY_CHECKS_INVALID');
  if (checks.length === 0) {
    return {
      state: 'UNKNOWN',
      checks: [],
      hardDisqualifiers: [],
      missingEvidence: ALL_CHECK_KINDS.map((kind) => `${kind}:UNKNOWN`),
      evidenceRefs: [],
    };
  }

  const normalized = checks.map(normalizedCheck);
  const hardFailures = normalized.filter((check) => check.state === 'FAIL' && check.hardDisqualifier);
  const unknowns = normalized.filter((check) => check.state === 'UNKNOWN');
  const nonHardFailures = normalized.filter((check) => check.state === 'FAIL' && !check.hardDisqualifier);
  const passes = normalized.filter((check) => check.state === 'PASS');

  const evidenceRefs = [...new Set(normalized.flatMap((check) => check.evidenceRefs))].sort();
  const missingEvidence = unknowns.map((check) => `${check.kind}:UNKNOWN`).sort();
  const hardDisqualifiers = hardFailures.map((check) => check.statement).sort();

  let state: EligibilityAssessment['state'];
  if (hardFailures.length > 0) state = 'DISQUALIFIED';
  else if (unknowns.length === normalized.length) state = 'UNKNOWN';
  else if (unknowns.length > 0 || nonHardFailures.length > 0) state = 'PARTIAL';
  else if (passes.length === normalized.length) state = 'ELIGIBLE';
  else state = 'PARTIAL';

  return {
    state,
    checks: normalized,
    hardDisqualifiers,
    missingEvidence,
    evidenceRefs,
  };
}
