import type {
  AuthorizedPursuitAction,
  CredentialBroker,
  ExecutionResult,
  ExecutorRouter,
  PursuitExecutionStatus,
  PursuitVerifier,
  SessionBroker,
  VerificationResult,
} from '@opportunityos/core';

export interface PursuitRuntimeDependencies {
  router: ExecutorRouter;
  credentialBroker: CredentialBroker;
  sessionBroker: SessionBroker;
  verifier: PursuitVerifier;
}

export interface PursuitRuntimeConfig {
  liveWritesEnabled?: boolean;
  canaryPlatforms?: string[];
  maxWritesPerRuntime?: number;
}

export interface PursuitRuntimeResult {
  status: PursuitExecutionStatus;
  verified: boolean;
  execution?: ExecutionResult;
  verification?: VerificationResult;
  reason?: string;
}

function blocked(status: PursuitExecutionStatus, reason: string): PursuitRuntimeResult {
  return { status, verified: false, reason };
}

export class PursuitRuntime {
  private readonly dependencies: PursuitRuntimeDependencies;
  private readonly liveWritesEnabled: boolean;
  private readonly canaryPlatforms: Set<string>;
  private readonly maxWritesPerRuntime: number;
  private writesUsed = 0;

  constructor(dependencies: PursuitRuntimeDependencies, config: PursuitRuntimeConfig = {}) {
    this.dependencies = dependencies;
    this.liveWritesEnabled = config.liveWritesEnabled ?? false;
    this.canaryPlatforms = new Set(config.canaryPlatforms ?? []);
    const requestedLimit = config.maxWritesPerRuntime ?? 0;
    this.maxWritesPerRuntime = Number.isSafeInteger(requestedLimit) && requestedLimit >= 0 ? requestedLimit : 0;
  }

  async run(action: AuthorizedPursuitAction): Promise<PursuitRuntimeResult> {
    if (action.mode !== 'LIVE_AUTHORIZED') {
      return blocked('NEEDS_HUMAN_AUTH', 'LIVE_AUTHORIZED_MODE_REQUIRED');
    }
    if (!this.liveWritesEnabled) {
      return blocked('NEEDS_HUMAN_AUTH', 'LIVE_WRITES_DISABLED');
    }
    if (!this.canaryPlatforms.has(action.route.platform)) {
      return blocked('NEEDS_HUMAN_AUTH', 'PLATFORM_NOT_IN_CANARY_ALLOWLIST');
    }
    if (this.writesUsed >= this.maxWritesPerRuntime) {
      return blocked('NEEDS_HUMAN_AUTH', 'CANARY_WRITE_LIMIT_REACHED');
    }

    const preflight = await this.dependencies.router.preflight(
      action,
      this.dependencies.credentialBroker,
      this.dependencies.sessionBroker,
    );
    if (!preflight.ok) {
      return blocked(preflight.status, preflight.reason ?? 'ROUTE_PREFLIGHT_FAILED');
    }

    const registration = this.dependencies.router.resolve(action.route.platform, action.route.executorType);
    if (!registration) return blocked('UNAVAILABLE', 'EXECUTOR_NOT_REGISTERED');

    const target = {
      platform: action.route.platform,
      url: action.application.targetUrl,
      opportunityId: action.application.opportunityId,
      accountRef: action.route.accountRef,
    };
    const form = await registration.executor.inspect(target);
    const validation = await registration.executor.validate(action.application, form);
    if (!validation.allowed || !validation.canExecuteWrite) {
      return blocked(validation.status, validation.reason ?? 'SUBMISSION_POLICY_BLOCKED');
    }

    this.writesUsed += 1;
    const execution = await registration.executor.execute(action);
    if (execution.status !== 'EXECUTED_UNVERIFIED' && execution.status !== 'SUBMITTED_VERIFIED' && execution.status !== 'ALREADY_SUBMITTED') {
      return {
        status: execution.status,
        verified: false,
        execution,
        ...(execution.reason ? { reason: execution.reason } : {}),
      };
    }

    const verification = await this.dependencies.verifier.verify(action.application, execution);
    return {
      status: verification.status,
      verified: verification.verified,
      execution,
      verification,
      ...(verification.reason ? { reason: verification.reason } : {}),
    };
  }
}
