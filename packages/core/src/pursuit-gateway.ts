import { hashCanonical } from './canonical.ts';
import { authorizeAction, type ActionIntent, type Approval, type SignatureVerifier } from './trust-kernel.ts';
import type { AuthorizedPursuitAction, ExecutionMode, PreparedApplication, PursuitExecutionStatus, PursuitRoute } from './pursuit.ts';

export function createIdempotencyKey(application: PreparedApplication, accountRef: string, actionType: string): string {
  return hashCanonical({ platform: application.targetPlatform, accountRef, opportunityId: application.opportunityId, payloadHash: application.payloadHash, actionType });
}

export function createPursuitIntent(application: PreparedApplication, route: PursuitRoute, mode: ExecutionMode): ActionIntent {
  return { id: `${application.pursuitId}:submit`, actionType: 'SUBMIT_PURSUIT', payload: { application, route, mode } };
}

export type PursuitAuthorizationResult =
  | { authorized: true; action: AuthorizedPursuitAction }
  | { authorized: false; reason: 'ACTION_ID_MISMATCH' | 'ACTION_TYPE_MISMATCH' | 'PAYLOAD_HASH_MISMATCH' | 'APPROVAL_EXPIRED' | 'SIGNATURE_INVALID' };

export async function authorizePursuitAction(
  application: PreparedApplication,
  approval: Approval,
  route: PursuitRoute,
  mode: ExecutionMode,
  now: string,
  verifySignature: SignatureVerifier,
): Promise<PursuitAuthorizationResult> {
  const intent = createPursuitIntent(application, route, mode);
  const authorization = await authorizeAction(intent, approval, now, verifySignature);
  if (!authorization.authorized) return authorization;
  return {
    authorized: true,
    action: {
      actionId: intent.id,
      approvalRef: authorization.approvalId,
      idempotencyKey: createIdempotencyKey(application, route.accountRef, intent.actionType),
      application,
      route,
      mode,
    },
  };
}

export interface RetryDecision { retry: boolean; reconcile: boolean }

export function decideRetry(status: PursuitExecutionStatus): RetryDecision {
  if (status === 'EXECUTED_UNVERIFIED') return { retry: false, reconcile: true };
  if (status === 'FAILED') return { retry: true, reconcile: false };
  return { retry: false, reconcile: false };
}
