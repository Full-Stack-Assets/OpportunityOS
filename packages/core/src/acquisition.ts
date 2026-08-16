import type { ActionIntent } from './trust-kernel.ts';

export type FreshnessState = 'FRESH' | 'STALE' | 'REVALIDATION_REQUIRED';
export type VerificationState = 'UNVERIFIED' | 'VERIFIED' | 'INVALID';
export type EvidenceMatchState = 'EVIDENCE_MATCHED' | 'EVIDENCE_PARTIAL' | 'EVIDENCE_GAP';
export type PursuitState =
  | 'SHORTLISTED'
  | 'PREPARED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_NATIVE_CONFIRMATION'
  | 'PURSUED'
  | 'WARM'
  | 'CONVERSATION'
  | 'PROPOSAL'
  | 'WON'
  | 'LOST'
  | 'WITHDRAWN';

export interface DemandFact {
  statement: string;
  evidenceRefs: string[];
}

export interface DemandSignal {
  id: string;
  sourceType: string;
  sourceProvider: string;
  canonicalUrl: string | null;
  externalId: string | null;
  observedAt: string;
  retrievedAt: string;
  retrievalMethod: string;
  contentFingerprint: string;
  facts: DemandFact[];
  freshnessState: FreshnessState;
  verificationState: VerificationState;
  sourcePermissions: Record<string, unknown>;
  rawSourceRef: string;
  provenanceRefs: string[];
}

export interface ProspectAccount {
  id: string;
  displayName: string;
  primaryDomain: string | null;
  industry: string | null;
  geography: string | null;
  companySizeEvidence: string[];
  contacts: Array<Record<string, unknown>>;
  technologySignals: string[];
  signalIds: string[];
  identityConfidence: number;
  identityEvidenceRefs: string[];
}

export interface FactVsInference {
  kind: 'FACT' | 'INFERENCE';
  statement: string;
  evidenceRefs: string[];
}

export interface CommercialHypothesis {
  whyThisAccount: string;
  whyNow: string;
  observedProblemEvidence: string[];
  hypothesizedImprovement: string;
  factVsInference: FactVsInference[];
  estimatedValue: {
    amountCents: number | null;
    currency: string | null;
    confidence: number;
    assumptions: string[];
  };
  candidateCapabilityIds: string[];
  candidateArtifactIds: string[];
  showBeforeAsk: string;
  invalidationCriteria: string[];
  missingEvidence: string[];
}

export interface CapabilityMatch {
  state: EvidenceMatchState;
  evidenceRefs: string[];
  proofStep: string | null;
}

export interface PursuitPacket {
  id: string;
  opportunityId: string;
  prospectAccountId: string;
  state: PursuitState;
  selectedOffer: string;
  targetContact: string | null;
  contactChannel: string;
  evidenceRefs: string[];
  capabilityMatch: CapabilityMatch;
  proposedPayload: unknown;
  proposedActionType: string;
  expectedValue: {
    amountCents: number | null;
    currency: string | null;
    confidence: number;
  };
  estimatedPursuitCost: {
    amountCents: number;
    currency: string;
  };
  nextAction: string;
  nextActionDeadline: string | null;
  approvalState: string;
  actionEnvelopeHash: string | null;
  outcomeState: string;
  outcomeEvidenceRefs: string[];
}

export interface AcquisitionOutcome {
  id: string;
  pursuitId: string;
  state: string;
  observedAt: string;
  evidenceRefs: string[];
}

export function isDemandSignalActive(signal: Pick<DemandSignal, 'freshnessState' | 'verificationState'>): boolean {
  return signal.freshnessState === 'FRESH' && signal.verificationState === 'VERIFIED';
}

export function validateCommercialHypothesis(hypothesis: CommercialHypothesis): CommercialHypothesis {
  for (const claim of hypothesis.factVsInference) {
    if (claim.kind === 'FACT' && claim.evidenceRefs.length === 0) {
      throw new TypeError('FACT_EVIDENCE_REQUIRED');
    }
  }
  return hypothesis;
}

const PURSUIT_TRANSITIONS: Record<PursuitState, ReadonlySet<PursuitState>> = {
  SHORTLISTED: new Set(['PREPARED', 'WITHDRAWN']),
  PREPARED: new Set(['APPROVAL_REQUIRED', 'READY_FOR_NATIVE_CONFIRMATION', 'WITHDRAWN']),
  APPROVAL_REQUIRED: new Set(['PURSUED', 'WITHDRAWN']),
  READY_FOR_NATIVE_CONFIRMATION: new Set(['PURSUED', 'WITHDRAWN']),
  PURSUED: new Set(['WARM', 'LOST', 'WITHDRAWN']),
  WARM: new Set(['CONVERSATION', 'LOST', 'WITHDRAWN']),
  CONVERSATION: new Set(['PROPOSAL', 'WON', 'LOST', 'WITHDRAWN']),
  PROPOSAL: new Set(['WON', 'LOST', 'WITHDRAWN']),
  WON: new Set(),
  LOST: new Set(),
  WITHDRAWN: new Set(),
};

export function transitionPursuit(current: PursuitState, next: PursuitState): PursuitState {
  if (!PURSUIT_TRANSITIONS[current].has(next)) {
    throw new TypeError(`INVALID_PURSUIT_TRANSITION:${current}->${next}`);
  }
  return next;
}

export const ACQUISITION_SCORE_POLICY_V1 = Object.freeze({
  version: 'acquisition-score-v1',
  weights: Object.freeze({
    buyerIntentStrength: 25,
    evidenceMatch: 20,
    contactability: 15,
    commercialValue: 15,
    freshnessUrgency: 10,
    reuseEfficiency: 10,
    strategicCompounding: 5,
    riskPenalty: 20,
  }),
});

export interface AcquisitionScoreRawInputs {
  buyerIntentStrength: number | null;
  evidenceMatch: number | null;
  contactability: number | null;
  commercialValue: number | null;
  freshnessUrgency: number | null;
  reuseEfficiency: number | null;
  strategicCompounding: number | null;
  riskPenalty: number | null;
}

export interface AcquisitionScoreInput extends AcquisitionScoreRawInputs {
  evidenceRefs: string[];
  hardDisqualifiers: string[];
}

export interface AcquisitionScoreResult {
  policyVersion: string;
  rawInputs: AcquisitionScoreRawInputs;
  normalizedComponents: Record<keyof AcquisitionScoreRawInputs, number | null>;
  evidenceRefs: string[];
  unknownInputs: Array<keyof AcquisitionScoreRawInputs>;
  confidence: number;
  hardDisqualifiers: string[];
  finalScore: number;
  decision: 'SHORTLIST' | 'MONITOR' | 'REJECT';
  reason: string;
}

function assertUnitInterval(value: number | null, field: string): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be null or a number between 0 and 1`);
  }
}

export function scoreAcquisitionOpportunity(input: AcquisitionScoreInput): AcquisitionScoreResult {
  const rawInputs: AcquisitionScoreRawInputs = {
    buyerIntentStrength: input.buyerIntentStrength,
    evidenceMatch: input.evidenceMatch,
    contactability: input.contactability,
    commercialValue: input.commercialValue,
    freshnessUrgency: input.freshnessUrgency,
    reuseEfficiency: input.reuseEfficiency,
    strategicCompounding: input.strategicCompounding,
    riskPenalty: input.riskPenalty,
  };

  for (const [field, value] of Object.entries(rawInputs)) assertUnitInterval(value, field);

  const positiveFields = [
    'buyerIntentStrength',
    'evidenceMatch',
    'contactability',
    'commercialValue',
    'freshnessUrgency',
    'reuseEfficiency',
    'strategicCompounding',
  ] as const;
  const unknownInputs = (Object.keys(rawInputs) as Array<keyof AcquisitionScoreRawInputs>)
    .filter((field) => rawInputs[field] === null);

  let knownPositiveWeight = 0;
  let positiveWeightedTotal = 0;
  const normalizedComponents = {} as Record<keyof AcquisitionScoreRawInputs, number | null>;
  for (const field of positiveFields) {
    const value = rawInputs[field];
    normalizedComponents[field] = value;
    if (value === null) continue;
    const weight = ACQUISITION_SCORE_POLICY_V1.weights[field];
    knownPositiveWeight += weight;
    positiveWeightedTotal += value * weight;
  }
  normalizedComponents.riskPenalty = rawInputs.riskPenalty;

  const positiveScore = knownPositiveWeight === 0 ? 0 : (positiveWeightedTotal / knownPositiveWeight) * 100;
  const penalty = (rawInputs.riskPenalty ?? 0) * ACQUISITION_SCORE_POLICY_V1.weights.riskPenalty;
  const finalScore = Number(Math.max(0, Math.min(100, positiveScore - penalty)).toFixed(4));
  const totalPositiveWeight = positiveFields.reduce((sum, field) => sum + ACQUISITION_SCORE_POLICY_V1.weights[field], 0);
  const confidence = Number((knownPositiveWeight / totalPositiveWeight).toFixed(4));

  let decision: AcquisitionScoreResult['decision'];
  if (input.hardDisqualifiers.length > 0) decision = 'REJECT';
  else if (finalScore >= 65) decision = 'SHORTLIST';
  else if (finalScore >= 40) decision = 'MONITOR';
  else decision = 'REJECT';

  const reason = input.hardDisqualifiers.length > 0
    ? `Hard disqualifier: ${input.hardDisqualifiers.join(', ')}`
    : `${decision} at ${finalScore.toFixed(2)} with ${(confidence * 100).toFixed(0)}% known positive weight`;

  return {
    policyVersion: ACQUISITION_SCORE_POLICY_V1.version,
    rawInputs,
    normalizedComponents,
    evidenceRefs: [...input.evidenceRefs],
    unknownInputs,
    confidence,
    hardDisqualifiers: [...input.hardDisqualifiers],
    finalScore,
    decision,
    reason,
  };
}

function canonicalizeUrl(value: string | null): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase();
    url.search = '';
    url.hash = '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return value.trim();
  }
}

function demandIdentity(signal: DemandSignal): string {
  return [
    signal.sourceProvider.trim().toLowerCase(),
    signal.externalId?.trim() ?? '',
    canonicalizeUrl(signal.canonicalUrl),
    signal.contentFingerprint,
  ].join('\u0000');
}

export function deduplicateDemandSignals(signals: DemandSignal[]): {
  unique: DemandSignal[];
  duplicates: Array<{ duplicateId: string; canonicalId: string; reason: 'SOURCE_CONTENT_IDENTITY' }>;
} {
  const groups = new Map<string, DemandSignal[]>();
  for (const signal of signals) {
    const key = demandIdentity(signal);
    const group = groups.get(key) ?? [];
    group.push(signal);
    groups.set(key, group);
  }

  const unique: DemandSignal[] = [];
  const duplicates: Array<{ duplicateId: string; canonicalId: string; reason: 'SOURCE_CONTENT_IDENTITY' }> = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.id.localeCompare(right.id));
    const canonical = ordered[0];
    if (!canonical) continue;
    unique.push(canonical);
    for (const duplicate of ordered.slice(1)) {
      duplicates.push({ duplicateId: duplicate.id, canonicalId: canonical.id, reason: 'SOURCE_CONTENT_IDENTITY' });
    }
  }
  unique.sort((left, right) => left.id.localeCompare(right.id));
  duplicates.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId) || left.duplicateId.localeCompare(right.duplicateId));
  return { unique, duplicates };
}

export function validatePursuitPacket(packet: PursuitPacket): PursuitPacket {
  if (packet.evidenceRefs.length === 0) throw new TypeError('PURSUIT_EVIDENCE_REQUIRED');
  if (packet.capabilityMatch.state === 'EVIDENCE_GAP' && !packet.capabilityMatch.proofStep?.trim()) {
    throw new TypeError('EVIDENCE_GAP_PROOF_STEP_REQUIRED');
  }
  if (
    packet.capabilityMatch.state !== 'EVIDENCE_GAP'
    && packet.capabilityMatch.evidenceRefs.length === 0
  ) {
    throw new TypeError('CAPABILITY_EVIDENCE_REQUIRED');
  }
  return packet;
}

export interface AcquisitionPriorityItem {
  id: string;
  signalType: 'DIRECT_CLIENT_REPLY' | 'COLD_SOURCE' | 'OTHER';
  basePriority: number;
}

export function applyWarmSignalPriority<T extends AcquisitionPriorityItem>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftLane = left.signalType === 'DIRECT_CLIENT_REPLY' ? 0 : 1;
    const rightLane = right.signalType === 'DIRECT_CLIENT_REPLY' ? 0 : 1;
    return leftLane - rightLane || right.basePriority - left.basePriority || left.id.localeCompare(right.id);
  });
}

export function preparePursuitActionIntent(packet: PursuitPacket): ActionIntent {
  validatePursuitPacket(packet);
  return {
    id: packet.id,
    actionType: packet.proposedActionType,
    payload: {
      opportunityId: packet.opportunityId,
      prospectAccountId: packet.prospectAccountId,
      selectedOffer: packet.selectedOffer,
      targetContact: packet.targetContact,
      contactChannel: packet.contactChannel,
      proposedPayload: packet.proposedPayload,
    },
  };
}
