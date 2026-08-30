import type {
  AuthorizedPursuitAction,
  ExecutionResult,
  PreparedApplication,
  PursuitExecutor,
  PursuitRoute,
  PursuitVerifier,
  PursuitVerificationResult,
} from './pursuit.ts';
import type { CredentialBroker, SessionBroker } from './pursuit-brokers.ts';

export interface ExecutorRegistration {
  platform: string;
  executorType: PursuitRoute['executorType'];
  executor: PursuitExecutor;
}

export interface RouterPreflightResult {
  ok: boolean;
  status: ExecutionResult['status'];
  reason?: string;
}

const ROUTE_PRIORITY: Record<PursuitRoute['executorType'], number> = {
  official_api: 0,
  browser: 1,
  email: 2,
};

export class ExecutorRouter {
  private readonly registrations: ExecutorRegistration[];

  constructor(registrations: readonly ExecutorRegistration[] = []) {
    this.registrations = [...registrations];
  }

  resolve(platform: string, executorType?: PursuitRoute['executorType']): ExecutorRegistration | undefined {
    const matches = this.registrations
      .filter((candidate) => candidate.platform === platform && (!executorType || candidate.executorType === executorType))
      .sort((a, b) => ROUTE_PRIORITY[a.executorType] - ROUTE_PRIORITY[b.executorType]);
    return matches[0];
  }

  async preflight(
    action: AuthorizedPursuitAction,
    credentialBroker: CredentialBroker,
    sessionBroker: SessionBroker,
  ): Promise<RouterPreflightResult> {
    const registration = this.resolve(action.route.platform, action.route.executorType);
    if (!registration) return { ok: false, status: 'UNAVAILABLE', reason: 'EXECUTOR_NOT_REGISTERED' };

    if (action.route.executorType === 'official_api') {
      const result = await credentialBroker.resolve({
        ...(action.route.credentialRef ? { credentialRef: action.route.credentialRef } : {}),
        platform: action.route.platform,
        accountRef: action.route.accountRef,
      });
      return result.ok
        ? { ok: true, status: 'EXECUTED_UNVERIFIED' }
        : { ok: false, status: result.status, ...(result.reason ? { reason: result.reason } : {}) };
    }

    if (action.route.executorType === 'browser') {
      const result = await sessionBroker.inspect({
        ...(action.route.sessionRef ? { sessionRef: action.route.sessionRef } : {}),
        platform: action.route.platform,
        accountRef: action.route.accountRef,
      });
      return result.ok
        ? { ok: true, status: 'EXECUTED_UNVERIFIED' }
        : { ok: false, status: result.status, ...(result.reason ? { reason: result.reason } : {}) };
    }

    return { ok: true, status: 'EXECUTED_UNVERIFIED' };
  }
}

export interface VerificationEvidence {
  found: boolean;
  externalId?: string;
  evidenceRefs: string[];
  reason?: string;
}

export type VerificationProbe = (
  application: PreparedApplication,
  execution: ExecutionResult,
) => Promise<VerificationEvidence>;

export class EvidenceBackedPursuitVerifier implements PursuitVerifier {
  private readonly probe: VerificationProbe;

  constructor(probe: VerificationProbe) {
    this.probe = probe;
  }

  async verify(application: PreparedApplication, execution: ExecutionResult): Promise<PursuitVerificationResult> {
    const verifiedAt = new Date().toISOString();

    if (execution.status === 'SUBMITTED_VERIFIED' || execution.status === 'ALREADY_SUBMITTED') {
      return {
        actionId: execution.actionId,
        verified: true,
        status: execution.status,
        verifiedAt,
        ...(execution.externalId ? { externalId: execution.externalId } : {}),
        evidenceRefs: execution.evidenceRefs ?? [],
      };
    }

    if (execution.status !== 'EXECUTED_UNVERIFIED') {
      return {
        actionId: execution.actionId,
        verified: false,
        status: execution.status,
        verifiedAt,
        ...(execution.externalId ? { externalId: execution.externalId } : {}),
        evidenceRefs: execution.evidenceRefs ?? [],
        reason: execution.reason ?? 'EXECUTION_NOT_ELIGIBLE_FOR_VERIFICATION',
      };
    }

    const evidence = await this.probe(application, execution);
    const externalIdMatches = !execution.externalId || !evidence.externalId || execution.externalId === evidence.externalId;
    if (!evidence.found || evidence.evidenceRefs.length === 0 || !externalIdMatches) {
      return {
        actionId: execution.actionId,
        verified: false,
        status: 'EXECUTED_UNVERIFIED',
        verifiedAt,
        ...(execution.externalId ? { externalId: execution.externalId } : {}),
        evidenceRefs: evidence.evidenceRefs,
        reason: !externalIdMatches ? 'EXTERNAL_ID_MISMATCH' : (evidence.reason ?? 'INDEPENDENT_EVIDENCE_NOT_FOUND'),
      };
    }

    return {
      actionId: execution.actionId,
      verified: true,
      status: 'SUBMITTED_VERIFIED',
      verifiedAt,
      ...(evidence.externalId ? { externalId: evidence.externalId } : execution.externalId ? { externalId: execution.externalId } : {}),
      evidenceRefs: evidence.evidenceRefs,
    };
  }
}
