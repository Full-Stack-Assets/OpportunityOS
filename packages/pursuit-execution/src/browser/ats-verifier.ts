import type {
  ExecutionResult,
  PreparedApplication,
  PursuitVerificationResult,
  PursuitVerifier,
} from '@opportunityos/core';
import type { AtsProviderAdapter, ProviderAtsSessionFactory } from './provider-driver.ts';

function durableHttpEvidence(refs: string[] | undefined): string | undefined {
  return refs?.find((ref) => {
    try {
      const parsed = new URL(ref);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  });
}

export class AtsBrowserEvidenceVerifier<Page = unknown> implements PursuitVerifier {
  private readonly sessions: ProviderAtsSessionFactory<Page>;
  private readonly providers: AtsProviderAdapter<Page>[];
  private readonly sessionRef: string;
  private readonly now: () => string;

  constructor(
    sessions: ProviderAtsSessionFactory<Page>,
    providers: AtsProviderAdapter<Page>[],
    sessionRef: string,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.sessions = sessions;
    this.providers = providers;
    this.sessionRef = sessionRef;
    this.now = now;
  }

  async verify(application: PreparedApplication, execution: ExecutionResult): Promise<PursuitVerificationResult> {
    const verifiedAt = this.now();
    const base = {
      actionId: execution.actionId,
      verifiedAt,
      ...(execution.externalId ? { externalId: execution.externalId } : {}),
    };
    if (execution.executorType !== 'browser' || !execution.externalId) {
      return { ...base, verified: false, status: 'EXECUTED_UNVERIFIED', evidenceRefs: [], reason: 'BROWSER_EXTERNAL_ID_REQUIRED' };
    }
    const evidenceUrl = durableHttpEvidence(execution.evidenceRefs);
    if (!evidenceUrl) {
      return { ...base, verified: false, status: 'EXECUTED_UNVERIFIED', evidenceRefs: execution.evidenceRefs ?? [], reason: 'DURABLE_BROWSER_EVIDENCE_URL_REQUIRED' };
    }
    const provider = this.providers.find((candidate) => candidate.matches(evidenceUrl) || candidate.matches(application.targetUrl));
    if (!provider) {
      return { ...base, verified: false, status: 'EXECUTED_UNVERIFIED', evidenceRefs: execution.evidenceRefs ?? [], reason: 'ATS_VERIFIER_PROVIDER_UNAVAILABLE' };
    }

    const page = await this.sessions.open(evidenceUrl, this.sessionRef);
    try {
      const challenge = await provider.detectChallenge(page);
      if (challenge) {
        return { ...base, verified: false, status: challenge, evidenceRefs: execution.evidenceRefs ?? [], reason: `VERIFICATION_HALTED:${challenge}` };
      }
      const confirmation = await provider.confirm(page);
      if (!confirmation || confirmation.externalId !== execution.externalId) {
        return { ...base, verified: false, status: 'EXECUTED_UNVERIFIED', evidenceRefs: execution.evidenceRefs ?? [], reason: 'BROWSER_CONFIRMATION_ID_MISMATCH_OR_MISSING' };
      }
      return {
        ...base,
        verified: true,
        status: 'SUBMITTED_VERIFIED',
        evidenceRefs: [...new Set([...(execution.evidenceRefs ?? []), ...confirmation.evidenceRefs])],
      };
    } catch {
      return { ...base, verified: false, status: 'EXECUTED_UNVERIFIED', evidenceRefs: execution.evidenceRefs ?? [], reason: 'BROWSER_VERIFICATION_FAILED' };
    } finally {
      await this.sessions.close();
    }
  }
}
