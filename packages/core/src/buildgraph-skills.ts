export type CapabilityRisk = 'low' | 'medium' | 'high';
export type CapabilityAutonomy = 'autonomous' | 'autonomous-with-verification' | 'human-gated' | 'prohibited';

export interface CapabilityNode {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  requires: string[];
  permissions: string[];
  evidence: string[];
  verifier: string | null;
  risk: CapabilityRisk;
  autonomy: CapabilityAutonomy;
  failurePaths: string[];
}

export interface CapabilityResolution {
  goalId: string;
  status: 'ready' | 'human-gated' | 'blocked' | 'prohibited';
  orderedIds: string[];
  missingIds: string[];
  humanGateIds: string[];
  prohibitedIds: string[];
}

export const BUILDGRAPH_CAPABILITIES: CapabilityNode[] = [
  {
    id: 'opportunity.discover',
    name: 'Discover opportunities',
    description: 'Retrieve and normalize source-backed opportunities without marketplace writes.',
    inputs: ['source-query'], outputs: ['verified-opportunity-records'], requires: [], permissions: ['source.read'], evidence: ['source-provenance'], verifier: 'source.verify', risk: 'low', autonomy: 'autonomous-with-verification', failurePaths: ['source.unavailable'],
  },
  {
    id: 'source.verify',
    name: 'Verify source evidence',
    description: 'Validate source provenance and reject malformed or synthetic fallback evidence.',
    inputs: ['source-record'], outputs: ['verified-source-record'], requires: [], permissions: [], evidence: ['retrieval-method', 'source-id'], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [],
  },
  {
    id: 'opportunity.qualify',
    name: 'Qualify opportunity',
    description: 'Assess capability coverage, effort, risk, economics, evidence quality, and human intervention.',
    inputs: ['verified-opportunity-record'], outputs: ['qualification-decision'], requires: ['source.verify'], permissions: [], evidence: ['qualification-factors'], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [],
  },
  {
    id: 'opportunity.research',
    name: 'Research opportunity',
    description: 'Resolve decision-relevant client, company, requirement, technical, or market unknowns.',
    inputs: ['qualification-decision'], outputs: ['research-findings'], requires: ['opportunity.qualify'], permissions: ['research.read'], evidence: ['source-citations'], verifier: 'claim.verify', risk: 'low', autonomy: 'autonomous-with-verification', failurePaths: [],
  },
  {
    id: 'claim.verify',
    name: 'Verify claims',
    description: 'Check material factual claims against source or execution evidence.',
    inputs: ['claims'], outputs: ['claim-verdicts'], requires: [], permissions: [], evidence: ['claim-evidence-map'], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [],
  },
  {
    id: 'application.prepare',
    name: 'Prepare application',
    description: 'Prepare an evidence-bounded proposal, bid, application, or scope response.',
    inputs: ['qualified-opportunity', 'research-findings'], outputs: ['application-draft'], requires: ['opportunity.qualify', 'claim.verify'], permissions: [], evidence: ['portfolio-evidence', 'claim-verdicts'], verifier: 'claim.verify', risk: 'low', autonomy: 'autonomous-with-verification', failurePaths: [],
  },
  {
    id: 'application.submit',
    name: 'Submit application',
    description: 'Perform a marketplace or external application submission only with required authority.',
    inputs: ['verified-application'], outputs: ['submission-receipt'], requires: ['application.prepare', 'approval.route'], permissions: ['marketplace.write'], evidence: ['submission-receipt'], verifier: null, risk: 'medium', autonomy: 'human-gated', failurePaths: ['workflow.recover'],
  },
  {
    id: 'fulfillment.plan',
    name: 'Plan fulfillment',
    description: 'Compile requirements into an ordered capability graph with acceptance and evidence requirements.',
    inputs: ['task-requirements'], outputs: ['fulfillment-graph'], requires: [], permissions: [], evidence: ['acceptance-contract'], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [],
  },
  {
    id: 'fulfillment.execute',
    name: 'Execute fulfillment',
    description: 'Produce candidate work through authorized capabilities without self-verifying completion.',
    inputs: ['fulfillment-graph'], outputs: ['candidate-deliverable'], requires: ['fulfillment.plan'], permissions: ['workspace.write'], evidence: ['artifact-version'], verifier: 'deliverable.verify', risk: 'medium', autonomy: 'autonomous-with-verification', failurePaths: ['workflow.recover'],
  },
  {
    id: 'deliverable.verify',
    name: 'Verify deliverable',
    description: 'Independently check candidate work against the acceptance contract and exact artifact version.',
    inputs: ['candidate-deliverable', 'acceptance-contract'], outputs: ['verification-verdict'], requires: ['fulfillment.execute'], permissions: [], evidence: ['test-results', 'acceptance-results'], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: ['workflow.recover'],
  },
  {
    id: 'delivery.prepare',
    name: 'Prepare client delivery',
    description: 'Package verified work for handoff without claiming external delivery before a receipt exists.',
    inputs: ['verified-deliverable'], outputs: ['delivery-package'], requires: ['fulfillment.plan', 'fulfillment.execute', 'deliverable.verify'], permissions: [], evidence: ['verification-verdict', 'artifact-version'], verifier: 'deliverable.verify', risk: 'low', autonomy: 'autonomous-with-verification', failurePaths: [],
  },
  {
    id: 'delivery.send',
    name: 'Send client delivery',
    description: 'Perform an external delivery action only after applicable approval and platform gates pass.',
    inputs: ['delivery-package'], outputs: ['delivery-receipt'], requires: ['delivery.prepare', 'approval.route'], permissions: ['external.write'], evidence: ['delivery-receipt'], verifier: null, risk: 'medium', autonomy: 'human-gated', failurePaths: ['workflow.recover'],
  },
  {
    id: 'followup.prepare',
    name: 'Prepare follow-up',
    description: 'Inspect current state and prepare a non-duplicative follow-up that preserves prior scope.',
    inputs: ['workflow-state'], outputs: ['followup-draft'], requires: [], permissions: ['state.read'], evidence: ['current-state'], verifier: 'claim.verify', risk: 'low', autonomy: 'autonomous-with-verification', failurePaths: [],
  },
  {
    id: 'approval.route',
    name: 'Route human approval',
    description: 'Bind approval to an exact consequential action and payload without broadening authority.',
    inputs: ['action-payload'], outputs: ['approval-state'], requires: [], permissions: [], evidence: ['approval-contract'], verifier: null, risk: 'high', autonomy: 'human-gated', failurePaths: [],
  },
  {
    id: 'workflow.recover',
    name: 'Recover workflow',
    description: 'Classify failed nodes and select declared repair or fallback paths without weakening controls.',
    inputs: ['failure-evidence'], outputs: ['recovery-decision'], requires: [], permissions: [], evidence: ['failure-classification'], verifier: null, risk: 'medium', autonomy: 'autonomous-with-verification', failurePaths: [],
  },
  {
    id: 'capability.learn',
    name: 'Learn capability gaps',
    description: 'Rank repeated missing or weak capabilities using observed demand and execution evidence.',
    inputs: ['gap-observations'], outputs: ['capability-investment-ranking'], requires: [], permissions: [], evidence: ['gap-observations'], verifier: null, risk: 'low', autonomy: 'autonomous', failurePaths: [],
  },
];

export function resolveCapabilityGraph(
  goalId: string,
  availableCapabilities: Set<string>,
  registry: CapabilityNode[] = BUILDGRAPH_CAPABILITIES,
): CapabilityResolution {
  const byId = new Map(registry.map((node) => [node.id, node]));
  if (!byId.has(goalId)) throw new Error(`unknown capability: ${goalId}`);

  const orderedIds: string[] = [];
  const missingIds = new Set<string>();
  const humanGateIds = new Set<string>();
  const prohibitedIds = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`capability dependency cycle detected at ${id}`);
    const node = byId.get(id);
    if (!node) {
      missingIds.add(id);
      return;
    }
    visiting.add(id);
    for (const dependency of node.requires) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    orderedIds.push(id);

    if (!availableCapabilities.has(id)) missingIds.add(id);
    if (node.autonomy === 'human-gated') humanGateIds.add(id);
    if (node.autonomy === 'prohibited') prohibitedIds.add(id);
  };

  visit(goalId);

  let status: CapabilityResolution['status'] = 'ready';
  if (prohibitedIds.size > 0) status = 'prohibited';
  else if (missingIds.size > 0) status = 'blocked';
  else if (humanGateIds.size > 0) status = 'human-gated';

  return {
    goalId,
    status,
    orderedIds,
    missingIds: [...missingIds],
    humanGateIds: [...humanGateIds],
    prohibitedIds: [...prohibitedIds],
  };
}
