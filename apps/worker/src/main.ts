import {
  decideBuildStart,
  runBuildGraphPreflight,
  runSimulationWorkOrder,
  type BuildGraphClientOptions,
  type BuildGraphRequest,
  type FactoryKind,
  type Requirement,
  type SimulationResult,
} from '@opportunityos/core';

export interface WorkerInput {
  workOrderId: string;
  buildRequest: BuildGraphRequest;
  requirements: Requirement[];
  factory: FactoryKind;
  now: string;
}

export type WorkerResult =
  | { status: 'COMPLETED'; result: SimulationResult }
  | { status: 'REUSE_REQUIRED'; preflight: Awaited<ReturnType<typeof runBuildGraphPreflight>> };

export async function processWorkOrder(
  input: WorkerInput,
  buildGraph: BuildGraphClientOptions,
): Promise<WorkerResult> {
  const preflight = await runBuildGraphPreflight(input.buildRequest, buildGraph);
  const start = decideBuildStart(preflight);
  if (!start.allowed) return { status: 'REUSE_REQUIRED', preflight };

  const result = await runSimulationWorkOrder({
    workOrderId: input.workOrderId,
    preflight,
    requirements: input.requirements,
    factory: input.factory,
    now: input.now,
  });
  return { status: 'COMPLETED', result };
}
