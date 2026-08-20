import type {FactVsInference} from './acquisition.ts';
import type {PublicDemandCandidate} from './public-demand.ts';
import {
  extractObservedEconomicPain,
  type EconomicPainReport,
} from './economic-pain.ts';
import {
  crossMatchBuildGraphCommercialEvidence,
  type BuildGraphCommercialEvidence,
  type CommercialCapabilityMatch,
} from './commercial-buildgraph.ts';
import {
  assessCommercialEligibility,
  type EligibilityAssessment,
  type EligibilityCheck,
} from './commercial-eligibility.ts';
import {
  calculatePursuitEconomics,
  estimateCommercialValue,
  type CommercialValueReport,
  type PursuitEconomics,
} from './commercial-value.ts';
import {
  estimateWinProbability,
  type WinabilityInputs,
  type WinProbabilityEstimate,
} from './commercial-winability.ts';
import {
  classifyCommercialPriority,
  type CommercialPriority,
  type CriticalReason,
} from './commercial-priority.ts';
import {
  assessOpportunityRevalidation,
  type RevalidationAssessment,
} from './opportunity-revalidation.ts';
import {
  classifyPursuitTier,
  type PursuitTierAssessment,
} from './opportunity-pipeline-policy.ts';

export type InvestigationTaskKind =
  | 'REVALIDATE_SOURCE'
  | 'PROVE_CAPABILITY'
  | 'VERIFY_ELIGIBILITY'
  | 'RESOLVE_VALUE_SEMANTICS'
  | 'FALSIFY_OPPORTUNITY';

export interface InvestigationTask {
  id: string;
  kind: InvestigationTaskKind;
  description: string;
  required: boolean;
  evidenceRefs: string[];
}

export interface InvestigationTaskResolution {
  id: string;
  evidenceRefs: string[];
}

export interface CriticalInvestigationPacket {
  id: string;
  opportunityId: string;
  priority: CommercialPriority;
  criticalReason: CriticalReason | null;
  sourceEvidenceRefs: string[];
  factVsInference: FactVsInference[];
  economicPain: EconomicPainReport;
  buildGraphMatch: CommercialCapabilityMatch;
  commercialValue: CommercialValueReport;
  eligibility: EligibilityAssessment;
  winProbability: WinProbabilityEstimate;
  pursuitTier: PursuitTierAssessment;
  pursuitEconomics: PursuitEconomics;
  revalidation: RevalidationAssessment;
  falsificationQuestions: string[];
  proofTasks: InvestigationTask[];
  missingEvidence: string[];
  approvalReadiness: 'NOT_READY' | 'READY_FOR_HUMAN_REVIEW';
  externalActionAllowed: false;
}

export interface CommercialInvestigationInput {
  candidate: PublicDemandCandidate;
  buildGraphEvidence: BuildGraphCommercialEvidence | null;
  eligibilityChecks: EligibilityCheck[];
  winabilityOverrides?: Partial<Pick<WinabilityInputs, 'scopeFit' | 'competitionCloseability'>>;
  estimatedPursuitCostCents: number | null;
  now: string;
  lastRevalidatedAt: string | null;
  currentContentFingerprint: string | null;
  sourceStillActive: boolean | null;
  revalidationEvidenceRefs: string[];
  resolvedInvestigationTasks: InvestigationTaskResolution[];
}

function normalizeRefs(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sourceEvidenceRefs(candidate: PublicDemandCandidate, revalidationRefs: string[]): string[] {
  return normalizeRefs([
    candidate.signal.rawSourceRef,
    ...candidate.signal.provenanceRefs,
    ...candidate.signal.facts.flatMap((fact) => fact.evidenceRefs),
    ...revalidationRefs,
  ]);
}

function assertFactEvidence(candidate: PublicDemandCandidate): void {
  if (!candidate.signal.id.trim()) throw new TypeError('COMMERCIAL_OPPORTUNITY_ID_REQUIRED');
  for (const fact of candidate.signal.facts) {
    if (!fact.statement.trim()) throw new TypeError('COMMERCIAL_FACT_STATEMENT_REQUIRED');
    if (!fact.evidenceRefs.some((ref) => ref.trim().length > 0)) {
      throw new TypeError('COMMERCIAL_FACT_EVIDENCE_REQUIRED');
    }
  }
}

function eligibilityFactor(eligibility: EligibilityAssessment): number | null {
  switch (eligibility.state) {
    case 'ELIGIBLE': return 1;
    case 'PARTIAL': return 0.6;
    case 'DISQUALIFIED': return 0;
    case 'UNKNOWN': return null;
  }
}

function reuseEfficiency(match: CommercialCapabilityMatch): number | null {
  if (match.reuseDecision === null || match.evidenceRefs.length === 0) return null;
  return match.reuseDecision === 'CREATE_NEW' ? null : 0.8;
}

function topPortfolioScore(candidate: PublicDemandCandidate): number | null {
  const scores = candidate.portfolioMatches
    .map((match) => match.score)
    .filter((score) => Number.isFinite(score) && score >= 0 && score <= 1);
  return scores.length === 0 ? null : Math.max(...scores);
}

function inferenceEvidence(
  candidate: PublicDemandCandidate,
  pain: EconomicPainReport,
  eligibility: EligibilityAssessment,
  buildGraphMatch: CommercialCapabilityMatch,
): string[] {
  return normalizeRefs([
    ...candidate.signal.provenanceRefs,
    ...pain.evidenceRefs,
    ...eligibility.evidenceRefs,
    ...buildGraphMatch.evidenceRefs,
  ]);
}

function buildFactVsInference(
  candidate: PublicDemandCandidate,
  priority: CommercialPriority,
  criticalReason: CriticalReason | null,
  winProbability: WinProbabilityEstimate,
  evidenceRefs: string[],
): FactVsInference[] {
  const facts: FactVsInference[] = candidate.signal.facts.map((fact) => ({
    kind: 'FACT',
    statement: fact.statement,
    evidenceRefs: normalizeRefs(fact.evidenceRefs),
  }));
  const inferences: FactVsInference[] = [{
    kind: 'INFERENCE',
    statement: `commercial-priority:${priority}`,
    evidenceRefs,
  }];
  if (criticalReason !== null) {
    inferences.push({
      kind: 'INFERENCE',
      statement: `critical-reason:${criticalReason}`,
      evidenceRefs,
    });
  }
  if (winProbability.probability !== null) {
    inferences.push({
      kind: 'INFERENCE',
      statement: `uncalibrated-win-probability:${winProbability.probability}`,
      evidenceRefs: normalizeRefs([...evidenceRefs, ...winProbability.evidenceRefs]),
    });
  }
  return [...facts, ...inferences];
}

function taskId(opportunityId: string, kind: InvestigationTaskKind): string {
  return `investigation:${opportunityId}:${kind.toLowerCase()}`;
}

function resolutionMap(resolutions: InvestigationTaskResolution[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const resolution of resolutions) {
    const id = resolution.id.trim();
    if (!id) throw new TypeError('INVESTIGATION_TASK_RESOLUTION_ID_REQUIRED');
    result.set(id, normalizeRefs([...(result.get(id) ?? []), ...resolution.evidenceRefs]));
  }
  return result;
}

function makeTask(input: {
  opportunityId: string;
  kind: InvestigationTaskKind;
  description: string;
  baseEvidenceRefs: string[];
  resolutions: Map<string, string[]>;
  missingEvidence: Set<string>;
}): InvestigationTask {
  const id = taskId(input.opportunityId, input.kind);
  const resolution = input.resolutions.get(id);
  const resolvedWithEvidence = resolution !== undefined && resolution.length > 0;
  if (resolution !== undefined && !resolvedWithEvidence) {
    input.missingEvidence.add(`RESOLUTION_EVIDENCE_MISSING:${id}`);
  }
  return {
    id,
    kind: input.kind,
    description: input.description,
    required: !resolvedWithEvidence,
    evidenceRefs: normalizeRefs([...input.baseEvidenceRefs, ...(resolution ?? [])]),
  };
}

function falsificationQuestions(priority: CommercialPriority, criticalReason: CriticalReason | null): string[] {
  const questions = [
    'Is the source still active and does it still describe the same commercial need?',
    'Does verified BuildGraph evidence prove delivery capability for the requested scope?',
    'Are any explicit eligibility requirements unmet or still unknown?',
  ];
  if (criticalReason === 'BUDGET') {
    questions.push('Is the observed seven-figure amount actually a procurement budget or contract amount rather than unrelated economic exposure?');
  } else if (criticalReason === 'RECOVERABLE_LOSS') {
    questions.push('Is the observed seven-figure loss explicitly recoverable, and what evidence separates recoverable exposure from a purchasable contract value?');
  } else if (priority === 'P0') {
    questions.push('What evidence could quickly disprove the commercial value or closeability assumptions behind this P0 ranking?');
  }
  return questions;
}

export function buildCommercialInvestigation(input: CommercialInvestigationInput): CriticalInvestigationPacket {
  assertFactEvidence(input.candidate);

  const economicPain: EconomicPainReport = input.candidate.signal.verificationState === 'VERIFIED'
    ? extractObservedEconomicPain({
      facts: input.candidate.signal.facts,
      verificationState: input.candidate.signal.verificationState,
    })
    : {amounts: [], contradictions: [], evidenceRefs: []};

  const demandText = input.candidate.signal.facts.map((fact) => fact.statement).join(' ');
  const buildGraphMatch = crossMatchBuildGraphCommercialEvidence({
    demandText,
    evidence: input.buildGraphEvidence,
  });
  const eligibility = assessCommercialEligibility(input.eligibilityChecks);
  const commercialValue = estimateCommercialValue(economicPain.amounts);
  const priorityResult = classifyCommercialPriority({
    candidate: input.candidate,
    pain: economicPain,
    value: commercialValue,
    eligibility,
  });
  const revalidation = assessOpportunityRevalidation({
    priority: priorityResult.priority,
    retrievedAt: input.candidate.signal.retrievedAt,
    lastRevalidatedAt: input.lastRevalidatedAt,
    now: input.now,
    originalContentFingerprint: input.candidate.signal.contentFingerprint,
    currentContentFingerprint: input.currentContentFingerprint,
    sourceStillActive: input.sourceStillActive,
    revalidationEvidenceRefs: input.revalidationEvidenceRefs,
  });

  const scopeFit = input.winabilityOverrides?.scopeFit ?? topPortfolioScore(input.candidate);
  const competitionCloseability = input.winabilityOverrides?.competitionCloseability ?? null;
  const freshnessUrgency = revalidation.state !== 'CURRENT'
    ? null
    : priorityResult.priority === 'P0_CRITICAL' || priorityResult.priority === 'P0'
      ? 1
      : 0.7;
  const winEvidenceRefs = normalizeRefs([
    ...input.candidate.signal.provenanceRefs,
    ...input.candidate.signal.facts.flatMap((fact) => fact.evidenceRefs),
    ...buildGraphMatch.evidenceRefs,
    ...eligibility.evidenceRefs,
    ...revalidation.evidenceRefs,
  ]);

  const winProbability = estimateWinProbability({
    capabilityEvidence: buildGraphMatch.score,
    eligibility: eligibilityFactor(eligibility),
    buyerIntent: input.candidate.intent.score,
    credibility: input.candidate.credibility.credibilityScore,
    scopeFit,
    reuseEfficiency: reuseEfficiency(buildGraphMatch),
    freshnessUrgency,
    competitionCloseability,
    hardDisqualifiers: eligibility.hardDisqualifiers,
    evidenceRefs: winEvidenceRefs,
  });
  const pursuitTier = classifyPursuitTier({
    eligibilityState: eligibility.state,
    winProbability: winProbability.probability,
    confidence: winProbability.confidence,
    unresolvedClarifications: eligibility.missingEvidence,
    hardExclusions: eligibility.hardDisqualifiers,
  });
  const pursuitEconomics = calculatePursuitEconomics({
    contractValue: commercialValue.contractValue,
    winProbability: winProbability.probability,
    estimatedPursuitCostCents: input.estimatedPursuitCostCents,
  });

  const packetSourceEvidenceRefs = sourceEvidenceRefs(input.candidate, revalidation.evidenceRefs);
  const modeledEvidenceRefs = inferenceEvidence(input.candidate, economicPain, eligibility, buildGraphMatch);
  const factVsInference = buildFactVsInference(
    input.candidate,
    priorityResult.priority,
    priorityResult.criticalReason,
    winProbability,
    modeledEvidenceRefs,
  );

  const missingEvidence = new Set<string>(eligibility.missingEvidence);
  if (buildGraphMatch.state !== 'VERIFIED_MATCH') {
    for (const gap of buildGraphMatch.proofPlan) missingEvidence.add(gap);
  }
  for (const contradiction of economicPain.contradictions) {
    missingEvidence.add(`ECONOMIC_CONTRADICTION:${contradiction}`);
  }

  const resolutions = resolutionMap(input.resolvedInvestigationTasks);
  const proofTasks: InvestigationTask[] = [];
  const addTask = (
    kind: InvestigationTaskKind,
    description: string,
    baseEvidenceRefs: string[],
  ): void => {
    proofTasks.push(makeTask({
      opportunityId: input.candidate.signal.id,
      kind,
      description,
      baseEvidenceRefs,
      resolutions,
      missingEvidence,
    }));
  };

  if (revalidation.state !== 'CURRENT'
    || input.sourceStillActive === null
    || input.currentContentFingerprint === null) {
    addTask(
      'REVALIDATE_SOURCE',
      'Revalidate source activity, content fingerprint, scope, and commercial facts before human review.',
      revalidation.evidenceRefs,
    );
  }
  if (buildGraphMatch.state === 'EVIDENCE_GAP') {
    addTask(
      'PROVE_CAPABILITY',
      'Attach verified BuildGraph project, capability, or artifact evidence proving delivery ability for the requested scope.',
      buildGraphMatch.evidenceRefs,
    );
  }
  if (eligibility.state === 'UNKNOWN' || eligibility.state === 'PARTIAL') {
    addTask(
      'VERIFY_ELIGIBILITY',
      'Resolve the remaining buyer, geography, qualification, deadline, and capability-proof eligibility evidence.',
      eligibility.evidenceRefs,
    );
  }
  if (economicPain.contradictions.length > 0
    || priorityResult.criticalReason === 'RECOVERABLE_LOSS') {
    addTask(
      'RESOLVE_VALUE_SEMANTICS',
      'Resolve the distinction between economic exposure, recoverability, procurement budget, and defensible contract value.',
      economicPain.evidenceRefs,
    );
  }
  if (priorityResult.priority === 'P0_CRITICAL' || priorityResult.priority === 'P0') {
    addTask(
      'FALSIFY_OPPORTUNITY',
      'Complete the highest-value falsification checks before recommending external pursuit.',
      packetSourceEvidenceRefs,
    );
  }

  proofTasks.sort((a, b) => a.id.localeCompare(b.id));
  const approvalReadiness: CriticalInvestigationPacket['approvalReadiness'] =
    revalidation.state === 'CURRENT'
      && priorityResult.priority !== 'REJECT'
      && !input.candidate.credibility.reject
      && buildGraphMatch.state !== 'EVIDENCE_GAP'
      && eligibility.state !== 'DISQUALIFIED'
      && proofTasks.every((task) => !task.required)
      ? 'READY_FOR_HUMAN_REVIEW'
      : 'NOT_READY';

  return {
    id: `commercial-investigation:${input.candidate.signal.id}`,
    opportunityId: input.candidate.signal.id,
    priority: priorityResult.priority,
    criticalReason: priorityResult.criticalReason,
    sourceEvidenceRefs: packetSourceEvidenceRefs,
    factVsInference,
    economicPain,
    buildGraphMatch,
    commercialValue,
    eligibility,
    winProbability,
    pursuitTier,
    pursuitEconomics,
    revalidation,
    falsificationQuestions: falsificationQuestions(priorityResult.priority, priorityResult.criticalReason),
    proofTasks,
    missingEvidence: [...missingEvidence].sort(),
    approvalReadiness,
    externalActionAllowed: false,
  };
}
