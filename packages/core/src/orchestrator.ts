import type { BuildGraphPreflightResult } from './buildgraph.ts';
import { decideBuildStart } from './buildgraph.ts';
import type { FactoryKind } from './factories.ts';
import { simulateFactory } from './factories.ts';
import type { Requirement } from './requirements.ts';
import { compileRequirements } from './requirements.ts';
import { chainReceipt, type Receipt } from './trust-kernel.ts';
import { verifyArtifact, type VerificationResult } from './verification.ts';
import { transitionWorkOrder, type WorkOrder } from './work-order.ts';

export interface SimulationInput {
  workOrderId: string;
  preflight?: BuildGraphPreflightResult;
  requirements: Requirement[];
  factory: FactoryKind;
  now: string;
}

export interface SimulationResult {
  workOrder: WorkOrder;
  verification: VerificationResult;
  receipts: Receipt[];
  executionMode: 'SIMULATION';
  externalSideEffects: 0;
}

export async function runSimulationWorkOrder(input: SimulationInput): Promise<SimulationResult> {
  let workOrder: WorkOrder = { id: input.workOrderId, state: 'DRAFT', revision: 0 };
  workOrder = transitionWorkOrder(workOrder, 'BUILDGRAPH_PREFLIGHT');
  const buildDecision = decideBuildStart(input.preflight);
  if (!buildDecision.allowed) throw new Error(buildDecision.reason);
  workOrder = transitionWorkOrder(workOrder, 'POLICY_EVALUATION');
  workOrder = transitionWorkOrder(workOrder, 'APPROVED');
  workOrder = transitionWorkOrder(workOrder, 'READY');

  const compiled = compileRequirements(input.requirements);
  workOrder = transitionWorkOrder(workOrder, 'EXECUTING');
  const artifact = simulateFactory(input.factory, compiled);
  let receipt = chainReceipt(undefined, {
    actionId: `${input.workOrderId}:factory`,
    outcome: 'SIMULATED',
    occurredAt: input.now,
    evidence: { artifactId: artifact.id, checksum: artifact.checksum },
  });

  workOrder = transitionWorkOrder(workOrder, 'VERIFYING');
  const verification = verifyArtifact(artifact);
  if (!verification.verified) throw new Error(verification.reason);
  const verificationReceipt = chainReceipt(receipt, {
    actionId: `${input.workOrderId}:verification`,
    outcome: 'VERIFIED',
    occurredAt: input.now,
    evidence: verification,
  });
  receipt = verificationReceipt;
  workOrder = transitionWorkOrder(workOrder, 'COMPLETED');

  return {
    workOrder,
    verification,
    receipts: [
      chainReceipt(undefined, {
        actionId: `${input.workOrderId}:factory`,
        outcome: 'SIMULATED',
        occurredAt: input.now,
        evidence: { artifactId: artifact.id, checksum: artifact.checksum },
      }),
      receipt,
    ],
    executionMode: 'SIMULATION',
    externalSideEffects: 0,
  };
}
