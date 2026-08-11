import type { BuildGraphPreflightResult } from './buildgraph.ts';
import { decideBuildStart } from './buildgraph.ts';
import type { FactoryKind } from './factories.ts';
import { simulateFactory } from './factories.ts';
import type { Requirement } from './requirements.ts';
import { compileRequirements } from './requirements.ts';
import {
  authorizeAction,
  chainReceipt,
  type ActionIntent,
  type Approval,
  type Receipt,
  type SignatureVerifier,
} from './trust-kernel.ts';
import { verifyArtifact, type VerificationResult } from './verification.ts';
import { transitionWorkOrder, type WorkOrder } from './work-order.ts';

export interface SimulationInput {
  workOrderId: string;
  preflight?: BuildGraphPreflightResult;
  requirements: Requirement[];
  factory: FactoryKind;
  now: string;
  approval?: Approval;
  verifySignature?: SignatureVerifier;
}

export interface SimulationResult {
  workOrder: WorkOrder;
  verification: VerificationResult;
  receipts: Receipt[];
  executionMode: 'SIMULATION';
  externalSideEffects: 0;
}

export function createSimulationIntent(
  input: Pick<SimulationInput, 'workOrderId' | 'preflight' | 'requirements' | 'factory'>,
): ActionIntent {
  return {
    id: `${input.workOrderId}:execute`,
    actionType: 'EXECUTE_SIMULATION_WORKORDER',
    payload: {
      workOrderId: input.workOrderId,
      preflightPayloadHash: input.preflight?.payloadHash,
      requirements: input.requirements,
      factory: input.factory,
      executionMode: 'SIMULATION',
    },
  };
}

export async function runSimulationWorkOrder(input: SimulationInput): Promise<SimulationResult> {
  let workOrder: WorkOrder = { id: input.workOrderId, state: 'DRAFT', revision: 0 };
  workOrder = transitionWorkOrder(workOrder, 'BUILDGRAPH_PREFLIGHT');
  const buildDecision = decideBuildStart(input.preflight);
  if (!buildDecision.allowed) throw new Error(buildDecision.reason);

  workOrder = transitionWorkOrder(workOrder, 'POLICY_EVALUATION');
  if (!input.approval || !input.verifySignature) throw new Error('AUTHORIZATION_REQUIRED');
  const authorization = await authorizeAction(
    createSimulationIntent(input),
    input.approval,
    input.now,
    input.verifySignature,
  );
  if (!authorization.authorized) throw new Error(`AUTHORIZATION_DENIED:${authorization.reason}`);
  workOrder = transitionWorkOrder(workOrder, 'APPROVED');

  const authorizationReceipt = chainReceipt(undefined, {
    actionId: `${input.workOrderId}:authorization`,
    outcome: 'AUTHORIZED',
    occurredAt: input.now,
    evidence: {
      approvalId: authorization.approvalId,
      payloadHash: authorization.payloadHash,
    },
  });

  workOrder = transitionWorkOrder(workOrder, 'READY');
  const compiled = compileRequirements(input.requirements);
  workOrder = transitionWorkOrder(workOrder, 'EXECUTING');
  const artifact = simulateFactory(input.factory, compiled);
  const factoryReceipt = chainReceipt(authorizationReceipt, {
    actionId: `${input.workOrderId}:factory`,
    outcome: 'SIMULATED',
    occurredAt: input.now,
    evidence: { artifactId: artifact.id, checksum: artifact.checksum },
  });

  workOrder = transitionWorkOrder(workOrder, 'VERIFYING');
  const verification = verifyArtifact(artifact);
  if (!verification.verified) throw new Error(verification.reason);
  const verificationReceipt = chainReceipt(factoryReceipt, {
    actionId: `${input.workOrderId}:verification`,
    outcome: 'VERIFIED',
    occurredAt: input.now,
    evidence: verification,
  });
  workOrder = transitionWorkOrder(workOrder, 'COMPLETED');

  return {
    workOrder,
    verification,
    receipts: [authorizationReceipt, factoryReceipt, verificationReceipt],
    executionMode: 'SIMULATION',
    externalSideEffects: 0,
  };
}
