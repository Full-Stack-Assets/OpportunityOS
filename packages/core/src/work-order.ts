export type WorkOrderState =
  | 'DRAFT'
  | 'BUILDGRAPH_PREFLIGHT'
  | 'POLICY_EVALUATION'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'READY'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'NEEDS_YOU'
  | 'FAILED'
  | 'CANCELLED';

export interface WorkOrder {
  id: string;
  state: WorkOrderState;
  revision: number;
}

const transitions: Record<WorkOrderState, readonly WorkOrderState[]> = {
  DRAFT: ['BUILDGRAPH_PREFLIGHT', 'CANCELLED'],
  BUILDGRAPH_PREFLIGHT: ['POLICY_EVALUATION', 'NEEDS_YOU', 'CANCELLED'],
  POLICY_EVALUATION: ['REVIEW_REQUIRED', 'APPROVED', 'NEEDS_YOU', 'FAILED', 'CANCELLED'],
  REVIEW_REQUIRED: ['APPROVED', 'NEEDS_YOU', 'CANCELLED'],
  APPROVED: ['READY', 'CANCELLED'],
  READY: ['EXECUTING', 'NEEDS_YOU', 'CANCELLED'],
  EXECUTING: ['VERIFYING', 'NEEDS_YOU', 'FAILED'],
  VERIFYING: ['COMPLETED', 'NEEDS_YOU', 'FAILED'],
  COMPLETED: [],
  NEEDS_YOU: ['BUILDGRAPH_PREFLIGHT', 'POLICY_EVALUATION', 'REVIEW_REQUIRED', 'READY', 'CANCELLED'],
  FAILED: ['BUILDGRAPH_PREFLIGHT', 'CANCELLED'],
  CANCELLED: [],
};

export function transitionWorkOrder(workOrder: WorkOrder, next: WorkOrderState): WorkOrder {
  if (!transitions[workOrder.state].includes(next)) {
    throw new Error(`Invalid WorkOrder transition: ${workOrder.state} -> ${next}`);
  }
  return { ...workOrder, state: next, revision: workOrder.revision + 1 };
}
