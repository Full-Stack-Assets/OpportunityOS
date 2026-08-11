import {
  createSimulationIntent,
  decideBuildStart,
  runBuildGraphPreflight,
  runSimulationWorkOrder,
  type ActionIntent,
  type Approval,
  type BuildGraphClientOptions,
  type BuildGraphPreflightResult,
  type BuildGraphRequest,
  type FactoryKind,
  type Requirement,
  type SignatureVerifier,
  type SimulationResult,
} from '@opportunityos/core';

export interface WorkerPreparationInput {
  workOrderId: string;
  buildRequest: BuildGraphRequest;
  requirements: Requirement[];
  factory: FactoryKind;
  now: string;
}

export interface PreparedWorkOrder {
  workOrderId: string;
  preflight: BuildGraphPreflightResult;
  requirements: Requirement[];
  factory: FactoryKind;
  now: string;
  intent: ActionIntent;
}

export type PreparationResult =
  | { status: 'APPROVAL_REQUIRED'; prepared: PreparedWorkOrder }
  | { status: 'REUSE_REQUIRED'; preflight: BuildGraphPreflightResult };

export async function prepareWorkOrder(
  input: WorkerPreparationInput,
  buildGraph: BuildGraphClientOptions,
): Promise<PreparationResult> {
  const preflight = await runBuildGraphPreflight(input.buildRequest, buildGraph);
  const start = decideBuildStart(preflight);
  if (!start.allowed) return { status: 'REUSE_REQUIRED', preflight };

  const preparedBase = {
    workOrderId: input.workOrderId,
    preflight,
    requirements: input.requirements,
    factory: input.factory,
    now: input.now,
  };
  return {
    status: 'APPROVAL_REQUIRED',
    prepared: {
      ...preparedBase,
      intent: createSimulationIntent(preparedBase),
    },
  };
}

export async function executePreparedWorkOrder(
  prepared: PreparedWorkOrder,
  approval: Approval,
  verifySignature: SignatureVerifier,
): Promise<SimulationResult> {
  return runSimulationWorkOrder({
    workOrderId: prepared.workOrderId,
    preflight: prepared.preflight,
    requirements: prepared.requirements,
    factory: prepared.factory,
    now: prepared.now,
    approval,
    verifySignature,
  });
}
