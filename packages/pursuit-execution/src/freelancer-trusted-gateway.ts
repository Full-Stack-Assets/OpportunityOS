import type {
  AuthorizedPursuitAction,
  ExecutionResult,
  FormSchema,
  PreparedAnswer,
  PreparedApplication,
  PursuitExecutor,
  PursuitTarget,
  PursuitVerificationResult,
  ValidationResult,
} from '@opportunityos/core';

export type FreelancerGatewayInput =
  | {
      operation: 'submit_bid';
      approval_ref: string;
      idempotency_key: string;
      project_id: number;
      bidder_id: number;
      amount: number;
      period: number;
      milestone_percentage: number;
      description: string;
    }
  | {
      operation: 'verify_bid';
      bid_id: number;
    };

export interface FreelancerGatewayOutput {
  status: string;
  verified?: boolean;
  external_id?: string;
  evidence_refs?: string[];
  message?: string;
}

export type FreelancerGatewayTransport = (input: FreelancerGatewayInput) => Promise<FreelancerGatewayOutput>;

const GROUNDED = new Set(['VERIFIED_FACT', 'USER_ATTESTED_FACT']);

function groundedAnswer(application: PreparedApplication, fieldKey: string): PreparedAnswer | undefined {
  return application.answers.find((answer) => answer.fieldKey === fieldKey && GROUNDED.has(answer.evidenceClass));
}

function integerAnswer(application: PreparedApplication, fieldKey: string, minimum: number, maximum?: number): number | undefined {
  const value = groundedAnswer(application, fieldKey)?.answer;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) return undefined;
  if (maximum !== undefined && value > maximum) return undefined;
  return value;
}

function positiveNumberAnswer(application: PreparedApplication, fieldKey: string): number | undefined {
  const value = groundedAnswer(application, fieldKey)?.answer;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function projectId(application: PreparedApplication): number | undefined {
  const direct = Number(application.opportunityId);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  try {
    const parsed = new URL(application.targetUrl);
    const match = parsed.pathname.match(/\/projects\/(?:[^/]+\/)?(\d+)(?:\/|$)/);
    if (!match) return undefined;
    const candidate = Number(match[1]);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function compileBidEnvelope(action: AuthorizedPursuitAction): FreelancerGatewayInput | undefined {
  const application = action.application;
  const project_id = projectId(application);
  const bidder_id = integerAnswer(application, 'freelancer_bidder_id', 1);
  const amount = positiveNumberAnswer(application, 'freelancer_bid_amount');
  const period = integerAnswer(application, 'freelancer_bid_period_days', 1);
  const milestone_percentage = integerAnswer(application, 'freelancer_milestone_percentage', 0, 100);
  const description = application.proposalText?.trim();
  if (!project_id || !bidder_id || amount === undefined || !period || milestone_percentage === undefined || !description) return undefined;
  return {
    operation: 'submit_bid',
    approval_ref: action.approvalRef,
    idempotency_key: action.idempotencyKey,
    project_id,
    bidder_id,
    amount,
    period,
    milestone_percentage,
    description,
  };
}

function mapGatewayStatus(status: string): ExecutionResult['status'] {
  switch (status) {
    case 'submitted_verified': return 'SUBMITTED_VERIFIED';
    case 'executed_unverified': return 'EXECUTED_UNVERIFIED';
    case 'rejected_by_platform': return 'REJECTED_BY_PLATFORM';
    case 'needs_human_auth': return 'NEEDS_HUMAN_AUTH';
    case 'auth_required': return 'AUTH_REQUIRED';
    case 'mfa_required': return 'MFA_REQUIRED';
    case 'captcha_required': return 'CAPTCHA_REQUIRED';
    case 'session_expired': return 'SESSION_EXPIRED';
    case 'already_submitted': return 'ALREADY_SUBMITTED';
    case 'unavailable': return 'UNAVAILABLE';
    case 'failed': return 'FAILED';
    default: return 'FAILED';
  }
}

export class FreelancerTrustedGatewayExecutor implements PursuitExecutor {
  private readonly transport: FreelancerGatewayTransport;
  private readonly now: () => string;

  constructor(transport: FreelancerGatewayTransport, now: () => string = () => new Date().toISOString()) {
    this.transport = transport;
    this.now = now;
  }

  async inspect(target: PursuitTarget): Promise<FormSchema> {
    return {
      targetPlatform: target.platform,
      targetUrl: target.url,
      fields: [
        { fieldKey: 'freelancer_bidder_id', required: true, inputType: 'number' },
        { fieldKey: 'freelancer_bid_amount', required: true, inputType: 'number', attestationClass: 'COMPENSATION' },
        { fieldKey: 'freelancer_bid_period_days', required: true, inputType: 'number', attestationClass: 'AVAILABILITY' },
        { fieldKey: 'freelancer_milestone_percentage', required: true, inputType: 'number', attestationClass: 'COMPENSATION' },
      ],
      expectedCost: { requiresPurchase: false },
      inspectedAt: this.now(),
    };
  }

  async validate(application: PreparedApplication, form: FormSchema): Promise<ValidationResult> {
    if (application.targetPlatform !== 'freelancer' || form.targetPlatform !== 'freelancer') {
      return { allowed: false, canExecuteWrite: false, status: 'ACCOUNT_MISMATCH', reason: 'FREELANCER_PLATFORM_REQUIRED' };
    }
    const syntheticAction: AuthorizedPursuitAction = {
      actionId: 'validation-only',
      approvalRef: 'validation-only',
      idempotencyKey: 'validation-only',
      application,
      route: { executorType: 'official_api', platform: 'freelancer', accountRef: 'validation-only' },
      mode: 'LIVE_AUTHORIZED',
    };
    if (!compileBidEnvelope(syntheticAction)) {
      return { allowed: false, canExecuteWrite: false, status: 'NEEDS_INPUT', reason: 'GROUNDED_FREELANCER_BID_FACTS_REQUIRED' };
    }
    return { allowed: true, canExecuteWrite: true, status: 'EXECUTED_UNVERIFIED' };
  }

  async execute(action: AuthorizedPursuitAction): Promise<ExecutionResult> {
    const attemptedAt = this.now();
    if (action.route.executorType !== 'official_api') {
      return { actionId: action.actionId, status: 'UNAVAILABLE', executorType: action.route.executorType, platform: action.route.platform, attemptedAt, reason: 'OFFICIAL_API_ROUTE_REQUIRED' };
    }
    if (action.mode !== 'LIVE_AUTHORIZED') {
      return { actionId: action.actionId, status: 'NEEDS_HUMAN_AUTH', executorType: 'official_api', platform: action.route.platform, attemptedAt, reason: 'LIVE_AUTHORIZED_MODE_REQUIRED' };
    }
    if (action.route.platform !== 'freelancer' || action.application.targetPlatform !== 'freelancer') {
      return { actionId: action.actionId, status: 'ACCOUNT_MISMATCH', executorType: 'official_api', platform: action.route.platform, attemptedAt, reason: 'FREELANCER_PLATFORM_MISMATCH' };
    }

    const envelope = compileBidEnvelope(action);
    if (!envelope) {
      return { actionId: action.actionId, status: 'NEEDS_INPUT', executorType: 'official_api', platform: 'freelancer', attemptedAt, reason: 'GROUNDED_FREELANCER_BID_FACTS_REQUIRED' };
    }

    const output = await this.transport(envelope);
    const status = mapGatewayStatus(output.status);
    return {
      actionId: action.actionId,
      status,
      executorType: 'official_api',
      platform: 'freelancer',
      attemptedAt,
      ...(output.external_id ? { externalId: output.external_id } : {}),
      ...(output.evidence_refs ? { evidenceRefs: output.evidence_refs } : {}),
      ...(output.message ? { reason: output.message } : {}),
    };
  }

  async verify(application: PreparedApplication, execution: ExecutionResult): Promise<PursuitVerificationResult> {
    const verifiedAt = this.now();
    if (execution.platform !== 'freelancer' || !execution.externalId) {
      return { actionId: execution.actionId, verified: false, status: execution.status, verifiedAt, evidenceRefs: execution.evidenceRefs ?? [], reason: 'FREELANCER_EXTERNAL_ID_REQUIRED' };
    }
    const bidId = Number(execution.externalId);
    if (!Number.isSafeInteger(bidId) || bidId <= 0) {
      return { actionId: execution.actionId, verified: false, status: 'EXECUTED_UNVERIFIED', verifiedAt, externalId: execution.externalId, evidenceRefs: [], reason: 'INVALID_FREELANCER_BID_ID' };
    }
    const output = await this.transport({ operation: 'verify_bid', bid_id: bidId });
    if (output.status !== 'submitted_verified' || output.verified !== true || !output.evidence_refs?.length || output.external_id !== execution.externalId) {
      return { actionId: execution.actionId, verified: false, status: 'EXECUTED_UNVERIFIED', verifiedAt, externalId: execution.externalId, evidenceRefs: output.evidence_refs ?? [], reason: output.message ?? 'FREELANCER_BID_NOT_INDEPENDENTLY_VERIFIED' };
    }
    return { actionId: execution.actionId, verified: true, status: 'SUBMITTED_VERIFIED', verifiedAt, externalId: execution.externalId, evidenceRefs: output.evidence_refs };
  }
}
