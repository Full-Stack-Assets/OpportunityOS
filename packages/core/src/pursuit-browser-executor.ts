import { evaluateSubmissionPolicy } from './pursuit-policy.ts';
import type {
  AuthorizedPursuitAction,
  ExecutionResult,
  FormField,
  FormSchema,
  PreparedApplication,
  PursuitExecutor,
  PursuitTarget,
  ValidationResult,
} from './pursuit.ts';

export type BrowserSubmissionOutcome =
  | 'SUBMITTED'
  | 'ALREADY_SUBMITTED'
  | 'AUTH_REQUIRED'
  | 'MFA_REQUIRED'
  | 'CAPTCHA_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_MISMATCH'
  | 'REJECTED_BY_PLATFORM'
  | 'FAILED';

export interface BrowserFormSnapshot {
  formId?: string;
  fields: FormField[];
  expectedCost?: FormSchema['expectedCost'];
}

export interface BrowserSubmissionResult {
  outcome: BrowserSubmissionOutcome;
  externalId?: string;
  evidenceRefs?: string[];
  reason?: string;
}

export interface BrowserPursuitDriver {
  inspectForm(target: PursuitTarget): Promise<BrowserFormSnapshot>;
  submitApplication(action: AuthorizedPursuitAction): Promise<BrowserSubmissionResult>;
}

export class GuardedBrowserPursuitExecutor implements PursuitExecutor {
  private readonly driver: BrowserPursuitDriver;
  private readonly now: () => string;

  constructor(driver: BrowserPursuitDriver, now: () => string = () => new Date().toISOString()) {
    this.driver = driver;
    this.now = now;
  }

  async inspect(target: PursuitTarget): Promise<FormSchema> {
    const snapshot = await this.driver.inspectForm(target);
    return {
      targetPlatform: target.platform,
      targetUrl: target.url,
      ...(snapshot.formId ? { formId: snapshot.formId } : {}),
      fields: snapshot.fields,
      ...(snapshot.expectedCost ? { expectedCost: snapshot.expectedCost } : {}),
      inspectedAt: this.now(),
    };
  }

  async validate(application: PreparedApplication, form: FormSchema): Promise<ValidationResult> {
    const result = evaluateSubmissionPolicy(application, form, 'LIVE_AUTHORIZED', this.now());
    return {
      allowed: result.allowed,
      canExecuteWrite: result.canExecuteWrite,
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }

  async execute(action: AuthorizedPursuitAction): Promise<ExecutionResult> {
    const attemptedAt = this.now();
    if (action.route.executorType !== 'browser') {
      return {
        actionId: action.actionId,
        status: 'UNAVAILABLE',
        executorType: action.route.executorType,
        platform: action.route.platform,
        attemptedAt,
        reason: 'BROWSER_EXECUTOR_ROUTE_MISMATCH',
      };
    }

    if (action.mode !== 'LIVE_AUTHORIZED') {
      return {
        actionId: action.actionId,
        status: 'EXECUTED_UNVERIFIED',
        executorType: 'browser',
        platform: action.route.platform,
        attemptedAt,
        reason: `${action.mode}_IS_NON_WRITING`,
      };
    }

    const result = await this.driver.submitApplication(action);
    const common = {
      actionId: action.actionId,
      executorType: 'browser' as const,
      platform: action.route.platform,
      attemptedAt,
      ...(result.externalId ? { externalId: result.externalId } : {}),
      ...(result.evidenceRefs ? { evidenceRefs: result.evidenceRefs } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    };

    switch (result.outcome) {
      case 'SUBMITTED': return { ...common, status: 'EXECUTED_UNVERIFIED' };
      case 'ALREADY_SUBMITTED': return { ...common, status: 'ALREADY_SUBMITTED' };
      case 'AUTH_REQUIRED': return { ...common, status: 'AUTH_REQUIRED' };
      case 'MFA_REQUIRED': return { ...common, status: 'MFA_REQUIRED' };
      case 'CAPTCHA_REQUIRED': return { ...common, status: 'CAPTCHA_REQUIRED' };
      case 'SESSION_EXPIRED': return { ...common, status: 'SESSION_EXPIRED' };
      case 'ACCOUNT_MISMATCH': return { ...common, status: 'ACCOUNT_MISMATCH' };
      case 'REJECTED_BY_PLATFORM': return { ...common, status: 'REJECTED_BY_PLATFORM' };
      case 'FAILED': return { ...common, status: 'FAILED' };
    }
  }
}
