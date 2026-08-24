import {
  answerMayAutoFill,
  type AuthorizedPursuitAction,
  type BrowserFormSnapshot,
  type BrowserPursuitDriver,
  type BrowserSubmissionResult,
  type PreparedAnswer,
  type PursuitExecutionStatus,
  type PursuitTarget,
} from '@opportunityos/core';

export interface AtsProviderConfirmation {
  externalId: string;
  evidenceRefs: string[];
}

export interface AtsProviderAdapter<Page = unknown> {
  id: string;
  matches(url: string): boolean;
  inspect(page: Page, target: PursuitTarget): Promise<BrowserFormSnapshot>;
  detectChallenge(page: Page, expectedAccountRef?: string): Promise<PursuitExecutionStatus | null>;
  fill(page: Page, answer: PreparedAnswer): Promise<void>;
  upload(page: Page, artifactRef: string): Promise<void>;
  submit(page: Page): Promise<void>;
  confirm(page: Page): Promise<AtsProviderConfirmation | undefined>;
}

export interface ProviderAtsSessionFactory<Page = unknown> {
  open(targetUrl: string, sessionRef?: string): Promise<Page>;
  close(): Promise<void>;
}

function challengeOutcome(status: PursuitExecutionStatus): BrowserSubmissionResult['outcome'] | undefined {
  switch (status) {
    case 'AUTH_REQUIRED': return 'AUTH_REQUIRED';
    case 'MFA_REQUIRED': return 'MFA_REQUIRED';
    case 'CAPTCHA_REQUIRED': return 'CAPTCHA_REQUIRED';
    case 'SESSION_EXPIRED': return 'SESSION_EXPIRED';
    case 'ACCOUNT_MISMATCH': return 'ACCOUNT_MISMATCH';
    default: return undefined;
  }
}

export class ProviderAtsPlaywrightDriver<Page = unknown> implements BrowserPursuitDriver {
  private readonly sessions: ProviderAtsSessionFactory<Page>;
  private readonly providers: AtsProviderAdapter<Page>[];

  constructor(sessions: ProviderAtsSessionFactory<Page>, providers: AtsProviderAdapter<Page>[]) {
    this.sessions = sessions;
    this.providers = providers;
  }

  private provider(url: string): AtsProviderAdapter<Page> | undefined {
    return this.providers.find((candidate) => candidate.matches(url));
  }

  async inspectForm(target: PursuitTarget): Promise<BrowserFormSnapshot> {
    const provider = this.provider(target.url);
    if (!provider) throw new Error('ATS_PROVIDER_UNAVAILABLE');
    const page = await this.sessions.open(target.url);
    try {
      const challenge = await provider.detectChallenge(page, target.accountRef);
      if (challenge) throw new Error(challenge);
      return await provider.inspect(page, target);
    } finally {
      await this.sessions.close();
    }
  }

  async submitApplication(action: AuthorizedPursuitAction): Promise<BrowserSubmissionResult> {
    if (action.mode !== 'LIVE_AUTHORIZED') return { outcome: 'FAILED', reason: 'LIVE_AUTHORIZED_MODE_REQUIRED' };
    if (action.route.executorType !== 'browser') return { outcome: 'FAILED', reason: 'BROWSER_ROUTE_REQUIRED' };
    const provider = this.provider(action.application.targetUrl);
    if (!provider) return { outcome: 'FAILED', reason: 'ATS_PROVIDER_UNAVAILABLE' };

    const page = await this.sessions.open(action.application.targetUrl, action.route.sessionRef);
    try {
      const before = await provider.detectChallenge(page, action.route.accountRef);
      if (before) {
        const mapped = challengeOutcome(before);
        return mapped ? { outcome: mapped } : { outcome: 'FAILED', reason: before };
      }

      const live = await provider.inspect(page, {
        platform: action.application.targetPlatform,
        url: action.application.targetUrl,
        opportunityId: action.application.opportunityId,
        accountRef: action.route.accountRef,
      });
      const liveKeys = new Set(live.fields.map((field) => field.fieldKey));
      for (const answer of action.application.answers) {
        if (!liveKeys.has(answer.fieldKey) || !answerMayAutoFill(answer)) continue;
        await provider.fill(page, answer);
      }
      for (const artifactRef of action.application.requiredUploads) await provider.upload(page, artifactRef);

      const afterFill = await provider.detectChallenge(page, action.route.accountRef);
      if (afterFill) {
        const mapped = challengeOutcome(afterFill);
        return mapped ? { outcome: mapped } : { outcome: 'FAILED', reason: afterFill };
      }

      await provider.submit(page);
      const confirmation = await provider.confirm(page);
      if (!confirmation) return { outcome: 'SUBMITTED', reason: 'SUBMIT_CLICKED_CONFIRMATION_NOT_DURABLE' };
      return { outcome: 'SUBMITTED', externalId: confirmation.externalId, evidenceRefs: confirmation.evidenceRefs };
    } catch (error) {
      return { outcome: 'FAILED', reason: error instanceof Error ? error.message : 'ATS_PROVIDER_EXECUTION_FAILED' };
    } finally {
      await this.sessions.close();
    }
  }
}
