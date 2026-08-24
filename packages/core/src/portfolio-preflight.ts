import { hashCanonical } from './canonical.ts';
import type { BuildGraphDecision, BuildGraphPreflightResult } from './buildgraph.ts';
import type { KnowledgePreflightEvidence } from './knowledge-preflight.ts';

export type WorkScope = 'ROUTINE' | 'SUBSTANTIAL';

export type WorkKind =
  | 'NEW_PROJECT'
  | 'NEW_PRODUCT'
  | 'FEATURE'
  | 'ARCHITECTURE'
  | 'INTEGRATION'
  | 'AGENT'
  | 'SKILL'
  | 'RESEARCH_PROGRAM'
  | 'REFACTOR'
  | 'BUG_FIX'
  | 'TEST'
  | 'DOCS'
  | 'DEPENDENCY'
  | 'MAINTENANCE';

export interface PortfolioPreflightRequest {
  id: string;
  kind: WorkKind;
  summary: string;
  createsReusableCapability: boolean;
  changesArchitecture: boolean;
}

export interface PortfolioPreflightPolicy {
  preflightRequired: boolean;
  routineBypassAllowed: boolean;
  exemptionDecisionId?: string;
}

export type PortfolioKnowledgeEvidence = Pick<KnowledgePreflightEvidence, 'status' | 'allowCreateNew'>;

export type PortfolioBuildGraphPreflight = Pick<
  BuildGraphPreflightResult,
  'decision' | 'primaryProjectId' | 'justification' | 'evidence'
>;

export type PortfolioPreflightReason =
  | 'ROUTINE_BYPASS'
  | 'BUILDGRAPH_PREFLIGHT_REQUIRED'
  | 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE'
  | 'BUILDGRAPH_REVIEW_REQUIRED'
  | 'BUILDGRAPH_REUSE_REQUIRED'
  | 'BUILDGRAPH_CREATE_NEW_JUSTIFICATION_REQUIRED'
  | 'BUILDGRAPH_CREATE_NEW_AUTHORIZED';

export interface PortfolioPreflightDecision {
  allowed: boolean;
  scope: WorkScope;
  reason: PortfolioPreflightReason;
  workId?: string;
  primaryProjectId?: string;
  decision?: BuildGraphDecision;
  justification?: string;
  evidence?: BuildGraphPreflightResult['evidence'];
}

export interface PortfolioPreflightReceipt {
  id: string;
  workId: string;
  projectId?: string;
  scope: WorkScope;
  outcome: PortfolioPreflightReason;
  reason: PortfolioPreflightReason;
  decision?: BuildGraphDecision;
  justification?: string;
  evidence: BuildGraphPreflightResult['evidence'];
  generatedAt: string;
  receiptHash: string;
}

const ALWAYS_SUBSTANTIAL = new Set<WorkKind>([
  'NEW_PROJECT',
  'NEW_PRODUCT',
  'ARCHITECTURE',
  'INTEGRATION',
  'AGENT',
  'SKILL',
  'RESEARCH_PROGRAM',
]);

export function classifyWorkScope(request: PortfolioPreflightRequest): WorkScope {
  if (ALWAYS_SUBSTANTIAL.has(request.kind)) return 'SUBSTANTIAL';
  if (request.changesArchitecture || request.createsReusableCapability) return 'SUBSTANTIAL';
  if (request.kind === 'FEATURE' || request.kind === 'REFACTOR') return 'SUBSTANTIAL';
  return 'ROUTINE';
}

function blocked(
  scope: WorkScope,
  reason: PortfolioPreflightReason,
  preflight?: PortfolioBuildGraphPreflight,
): PortfolioPreflightDecision {
  return {
    allowed: false,
    scope,
    reason,
    ...(preflight?.primaryProjectId ? { primaryProjectId: preflight.primaryProjectId } : {}),
    ...(preflight?.decision ? { decision: preflight.decision } : {}),
    ...(preflight?.justification ? { justification: preflight.justification } : {}),
    ...(preflight?.evidence ? { evidence: preflight.evidence } : {}),
  };
}

export function evaluatePortfolioPreflight(
  request: PortfolioPreflightRequest,
  policy: PortfolioPreflightPolicy,
  knowledgeEvidence: PortfolioKnowledgeEvidence | undefined,
  preflight: PortfolioBuildGraphPreflight | undefined,
): PortfolioPreflightDecision {
  const scope = classifyWorkScope(request);

  if (scope === 'ROUTINE' && policy.routineBypassAllowed) {
    return { allowed: true, scope, reason: 'ROUTINE_BYPASS' };
  }

  if (!policy.preflightRequired) {
    return { allowed: true, scope, reason: 'ROUTINE_BYPASS' };
  }

  if (!knowledgeEvidence || !preflight) {
    return blocked(scope, 'BUILDGRAPH_PREFLIGHT_REQUIRED', preflight);
  }

  if (knowledgeEvidence.status === 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE') {
    return blocked(scope, 'BUILDGRAPH_KNOWLEDGE_UNAVAILABLE', preflight);
  }

  if (knowledgeEvidence.status === 'REVIEW') {
    return blocked(scope, 'BUILDGRAPH_REVIEW_REQUIRED', preflight);
  }

  if (knowledgeEvidence.status === 'REUSE_EVIDENCE_FOUND' || preflight.decision !== 'CREATE_NEW') {
    return blocked(scope, 'BUILDGRAPH_REUSE_REQUIRED', preflight);
  }

  if (!knowledgeEvidence.allowCreateNew) {
    return blocked(scope, 'BUILDGRAPH_REVIEW_REQUIRED', preflight);
  }

  const justification = preflight.justification.trim();
  if (!justification) {
    return blocked(scope, 'BUILDGRAPH_CREATE_NEW_JUSTIFICATION_REQUIRED', preflight);
  }

  return {
    allowed: true,
    scope,
    reason: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED',
    workId: request.id,
    decision: preflight.decision,
    justification,
    ...(preflight.primaryProjectId ? { primaryProjectId: preflight.primaryProjectId } : {}),
    evidence: preflight.evidence,
  };
}

export function createPortfolioPreflightReceipt(
  decision: PortfolioPreflightDecision,
  generatedAt: string,
): PortfolioPreflightReceipt {
  if (!decision.workId) throw new TypeError('Preflight decision must include workId before a receipt can be created');
  if (!Number.isFinite(Date.parse(generatedAt))) throw new TypeError('generatedAt must be a valid timestamp');

  const payload = {
    workId: decision.workId,
    ...(decision.primaryProjectId ? { projectId: decision.primaryProjectId } : {}),
    scope: decision.scope,
    outcome: decision.reason,
    reason: decision.reason,
    ...(decision.decision ? { decision: decision.decision } : {}),
    ...(decision.justification ? { justification: decision.justification } : {}),
    evidence: decision.evidence ?? { projectIds: [], constraintIds: [], decisionIds: [] },
    generatedAt,
  };
  const receiptHash = hashCanonical(payload);
  return {
    id: `knowledge-preflight:${receiptHash.slice(0, 20)}`,
    ...payload,
    receiptHash,
  };
}
