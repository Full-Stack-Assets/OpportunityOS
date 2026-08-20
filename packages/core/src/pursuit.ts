import { hashCanonical } from './canonical.ts';

export type ExecutionMode = 'SIMULATION' | 'LIVE_INSPECT' | 'LIVE_AUTHORIZED';

export type EvidenceClass =
  | 'VERIFIED_FACT'
  | 'USER_ATTESTED_FACT'
  | 'DERIVED_NONCONSEQUENTIAL'
  | 'PROPOSED_WORK'
  | 'UNRESOLVED'
  | 'PROHIBITED_TO_INFER';

export type AttestationClass =
  | 'ORDINARY'
  | 'COMPENSATION'
  | 'AVAILABILITY'
  | 'LEGAL'
  | 'DEMOGRAPHIC_EEO'
  | 'BACKGROUND_CHECK'
  | 'RELOCATION_TRAVEL'
  | 'PUBLICATION_VIDEO_WORK_SAMPLE';

export type AnswerConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PreparedAnswer {
  fieldKey: string;
  prompt: string;
  answer?: string | boolean | number;
  sourceOfTruthRef?: string;
  confidence: AnswerConfidence;
  evidenceClass: EvidenceClass;
  attestationClass: AttestationClass;
}

export interface ExpectedCost {
  currency?: string;
  amountMinor?: number;
  credits?: number;
  requiresPurchase: boolean;
}

export interface PreparedApplicationInput {
  opportunityId: string;
  pursuitId: string;
  targetPlatform: string;
  targetUrl: string;
  applicantIdentityRef: string;
  resumeArtifactRef?: string;
  coverLetter?: string;
  proposalText?: string;
  answers: PreparedAnswer[];
  portfolioRefs: string[];
  compensationExpectation?: string;
  availability?: string;
  location?: string;
  workAuthorizationStatus?: string;
  expectedCost: ExpectedCost;
  requiredUploads: string[];
  preparedAt: string;
  expiresAt: string;
}

export interface PreparedApplication extends PreparedApplicationInput {
  payloadHash: string;
}

export interface FormField {
  fieldKey: string;
  label?: string;
  inputType?: string;
  required: boolean;
  attestationClass?: AttestationClass;
  options?: string[];
}

export interface FormSchema {
  targetPlatform: string;
  targetUrl: string;
  formId?: string;
  fields: FormField[];
  expectedCost?: ExpectedCost;
  inspectedAt: string;
  schemaHash?: string;
}

export interface PursuitTarget {
  platform: string;
  url: string;
  opportunityId: string;
  accountRef: string;
}

export interface PursuitRoute {
  executorType: 'official_api' | 'browser' | 'email';
  platform: string;
  accountRef: string;
  credentialRef?: string;
  sessionRef?: string;
}

export interface ValidationResult {
  allowed: boolean;
  canExecuteWrite: boolean;
  status: PursuitExecutionStatus;
  reason?: string;
}

export interface AuthorizedPursuitAction {
  actionId: string;
  approvalRef: string;
  idempotencyKey: string;
  application: PreparedApplication;
  route: PursuitRoute;
  mode: ExecutionMode;
}

export interface ExecutionResult {
  actionId: string;
  status: PursuitExecutionStatus;
  executorType: PursuitRoute['executorType'];
  platform: string;
  attemptedAt: string;
  externalId?: string;
  evidenceRefs?: string[];
  reason?: string;
}

export interface PursuitVerificationResult {
  actionId: string;
  verified: boolean;
  status: PursuitExecutionStatus;
  verifiedAt: string;
  externalId?: string;
  evidenceRefs: string[];
  reason?: string;
}

export interface PursuitExecutor {
  inspect(target: PursuitTarget): Promise<FormSchema>;
  validate(application: PreparedApplication, form: FormSchema): Promise<ValidationResult>;
  execute(action: AuthorizedPursuitAction): Promise<ExecutionResult>;
}

export interface PursuitVerifier {
  verify(application: PreparedApplication, execution: ExecutionResult): Promise<PursuitVerificationResult>;
}

export const PURSUIT_EXECUTION_STATUSES = [
  'SUBMITTED_VERIFIED', 'EXECUTED_UNVERIFIED', 'ALREADY_SUBMITTED', 'REJECTED_BY_PLATFORM',
  'NEEDS_INPUT', 'NEEDS_HUMAN_AUTH', 'AUTH_REQUIRED', 'MFA_REQUIRED', 'CAPTCHA_REQUIRED',
  'SESSION_EXPIRED', 'ACCOUNT_MISMATCH', 'PAYLOAD_CHANGED', 'COST_CHANGED', 'UNAVAILABLE_SENDER',
  'UNAVAILABLE', 'FAILED',
] as const;

export type PursuitExecutionStatus = typeof PURSUIT_EXECUTION_STATUSES[number];

const GROUNDED_CONVENIENCE_EVIDENCE = new Set<EvidenceClass>(['VERIFIED_FACT', 'USER_ATTESTED_FACT']);

function assertNonNegativeSafeInteger(value: number | undefined, fieldName: string): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${fieldName} must be a non-negative safe integer`);
}

function assertGroundedConvenienceField(
  input: PreparedApplicationInput,
  fieldKey: 'availability' | 'work_authorization',
  convenienceValue: string | undefined,
  convenienceName: 'availability' | 'workAuthorizationStatus',
): void {
  if (convenienceValue === undefined) return;
  const grounded = input.answers.some((candidate) => candidate.fieldKey === fieldKey
    && GROUNDED_CONVENIENCE_EVIDENCE.has(candidate.evidenceClass)
    && typeof candidate.answer === 'string'
    && candidate.answer === convenienceValue);
  if (!grounded) throw new Error(`${convenienceName} must exactly mirror a grounded ${fieldKey} answer`);
}

export function compilePreparedApplication(input: PreparedApplicationInput): PreparedApplication {
  assertNonNegativeSafeInteger(input.expectedCost.amountMinor, 'expectedCost.amountMinor');
  assertNonNegativeSafeInteger(input.expectedCost.credits, 'expectedCost.credits');
  const preparedAt = Date.parse(input.preparedAt);
  const expiresAt = Date.parse(input.expiresAt);
  if (!Number.isFinite(preparedAt)) throw new Error('preparedAt must be parseable date text');
  if (!Number.isFinite(expiresAt)) throw new Error('expiresAt must be parseable date text');
  if (expiresAt <= preparedAt) throw new Error('expiresAt must be later than preparedAt');
  assertGroundedConvenienceField(input, 'availability', input.availability, 'availability');
  assertGroundedConvenienceField(input, 'work_authorization', input.workAuthorizationStatus, 'workAuthorizationStatus');
  return { ...input, payloadHash: hashCanonical(input) };
}
