import { hashCanonical } from './canonical.ts';
import type { DemandSignal } from './acquisition.ts';

export type PublicDemandProvider =
  | 'reddit'
  | 'hacker_news'
  | 'github_issues'
  | 'github_discussions'
  | 'devto'
  | 'discourse'
  | 'indie_hackers';

export interface PublicDemandSourceProfile {
  provider: PublicDemandProvider;
  sourceTypes: string[];
  allowedRetrievalMethods: string[];
  accessPolicy: 'OFFICIAL_API_ONLY' | 'PROVIDER_APPROVED_API_OR_FEED_ONLY' | 'MANUAL_OR_APPROVED_FEED_ONLY';
  writeEnabled: false;
}

export const PUBLIC_DEMAND_SOURCE_PROFILES: Record<PublicDemandProvider, PublicDemandSourceProfile> = Object.freeze({
  reddit: {
    provider: 'reddit',
    sourceTypes: ['reddit_post', 'reddit_comment'],
    allowedRetrievalMethods: ['official_api'],
    accessPolicy: 'OFFICIAL_API_ONLY',
    writeEnabled: false,
  },
  hacker_news: {
    provider: 'hacker_news',
    sourceTypes: ['hacker_news_item'],
    allowedRetrievalMethods: ['official_api', 'provider_public_api'],
    accessPolicy: 'PROVIDER_APPROVED_API_OR_FEED_ONLY',
    writeEnabled: false,
  },
  github_issues: {
    provider: 'github_issues',
    sourceTypes: ['github_issue'],
    allowedRetrievalMethods: ['official_api'],
    accessPolicy: 'OFFICIAL_API_ONLY',
    writeEnabled: false,
  },
  github_discussions: {
    provider: 'github_discussions',
    sourceTypes: ['github_discussion'],
    allowedRetrievalMethods: ['official_api'],
    accessPolicy: 'OFFICIAL_API_ONLY',
    writeEnabled: false,
  },
  devto: {
    provider: 'devto',
    sourceTypes: ['devto_article', 'devto_comment'],
    allowedRetrievalMethods: ['official_api', 'provider_public_api'],
    accessPolicy: 'PROVIDER_APPROVED_API_OR_FEED_ONLY',
    writeEnabled: false,
  },
  discourse: {
    provider: 'discourse',
    sourceTypes: ['discourse_topic', 'discourse_post'],
    allowedRetrievalMethods: ['official_api', 'provider_public_api'],
    accessPolicy: 'PROVIDER_APPROVED_API_OR_FEED_ONLY',
    writeEnabled: false,
  },
  indie_hackers: {
    provider: 'indie_hackers',
    sourceTypes: ['indie_hackers_post'],
    allowedRetrievalMethods: ['manual_verified', 'provider_approved_feed'],
    accessPolicy: 'MANUAL_OR_APPROVED_FEED_ONLY',
    writeEnabled: false,
  },
});

export type SourceHealthState = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export interface SourceHealthInput {
  configured: boolean;
  verificationSucceeded: boolean;
  verifiedAt: string | null;
  error: string | null;
}

export interface SourceHealthReport extends SourceHealthInput {
  provider: PublicDemandProvider;
  state: SourceHealthState;
}

export function assessSourceHealth(provider: PublicDemandProvider, input: SourceHealthInput): SourceHealthReport {
  if (!PUBLIC_DEMAND_SOURCE_PROFILES[provider]) throw new TypeError(`UNKNOWN_PUBLIC_DEMAND_SOURCE:${provider}`);
  let state: SourceHealthState;
  if (!input.configured) state = 'UNAVAILABLE';
  else if (input.verificationSucceeded) state = 'HEALTHY';
  else if (input.verifiedAt) state = 'DEGRADED';
  else state = 'UNAVAILABLE';
  return { provider, state, ...input };
}

export interface RawPublicDemandObservation {
  provider: PublicDemandProvider;
  sourceType: string;
  externalId: string;
  canonicalUrl: string;
  title: string;
  body: string;
  authorId: string | null;
  observedAt: string;
  retrievedAt: string;
  retrievalMethod: string;
  verified: boolean;
  verificationEvidenceRefs: string[];
}

function assertIso(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${field.toUpperCase()}_INVALID`);
}

function observationText(observation: RawPublicDemandObservation): string {
  return `${observation.title}\n${observation.body}`.trim();
}

export function normalizePublicDemandObservation(
  observation: RawPublicDemandObservation,
  health: SourceHealthReport,
): DemandSignal {
  const profile = PUBLIC_DEMAND_SOURCE_PROFILES[observation.provider];
  if (!profile) throw new TypeError(`UNKNOWN_PUBLIC_DEMAND_SOURCE:${observation.provider}`);
  if (health.provider !== observation.provider) throw new TypeError('SOURCE_HEALTH_PROVIDER_MISMATCH');
  if (health.state === 'UNAVAILABLE') throw new TypeError('SOURCE_UNAVAILABLE');
  if (!observation.verified) throw new TypeError('SOURCE_NOT_VERIFIED');
  if (!profile.sourceTypes.includes(observation.sourceType)) throw new TypeError('SOURCE_TYPE_NOT_ALLOWED');
  if (!profile.allowedRetrievalMethods.includes(observation.retrievalMethod)) throw new TypeError('RETRIEVAL_METHOD_NOT_ALLOWED');
  if (observation.verificationEvidenceRefs.length === 0) throw new TypeError('PROVENANCE_REQUIRED');
  if (!observation.externalId.trim() || !observation.canonicalUrl.trim() || !observation.title.trim()) throw new TypeError('SOURCE_IDENTITY_REQUIRED');
  assertIso(observation.observedAt, 'observedAt');
  assertIso(observation.retrievedAt, 'retrievedAt');

  const text = observationText(observation);
  const contentFingerprint = hashCanonical({
    provider: observation.provider,
    externalId: observation.externalId,
    canonicalUrl: observation.canonicalUrl,
    title: observation.title,
    body: observation.body,
  });
  const rawSourceRef = observation.verificationEvidenceRefs[0]!;

  return {
    id: `demand:${observation.provider}:${observation.externalId}`,
    sourceType: observation.sourceType,
    sourceProvider: observation.provider,
    canonicalUrl: observation.canonicalUrl,
    externalId: observation.externalId,
    observedAt: observation.observedAt,
    retrievedAt: observation.retrievedAt,
    retrievalMethod: observation.retrievalMethod,
    contentFingerprint,
    facts: [
      { statement: observation.title.trim(), evidenceRefs: [...observation.verificationEvidenceRefs] },
      ...(observation.body.trim() ? [{ statement: observation.body.trim(), evidenceRefs: [...observation.verificationEvidenceRefs] }] : []),
    ],
    freshnessState: 'FRESH',
    verificationState: 'VERIFIED',
    sourcePermissions: {
      read: true,
      write: false,
      accessPolicy: profile.accessPolicy,
      sourceHealth: health.state,
      observedTextLength: text.length,
    },
    rawSourceRef,
    provenanceRefs: [...observation.verificationEvidenceRefs],
  };
}

export type BuyerIntentKind = 'EXPLICIT_BUYER_REQUEST' | 'SPECIFIC_BUILD_NEED' | 'OPERATIONAL_PROBLEM' | 'WEAK_SIGNAL';

export interface BuyerIntentClassification {
  kind: BuyerIntentKind;
  score: number;
  indicators: string[];
}

const EXPLICIT_BUYER_PATTERNS = [
  /looking for (?:a |an )?(?:developer|engineer|freelancer|contractor)/i,
  /need (?:a |an )?(?:developer|engineer|freelancer|contractor)/i,
  /seeking (?:a |an )?(?:developer|engineer|freelancer|contractor)/i,
  /hire (?:a |an )?(?:developer|engineer|freelancer|contractor)/i,
  /can someone (?:build|develop|automate|integrate)/i,
];

const BUILD_NEED_PATTERNS = [
  /\bneed\b.{0,60}\b(?:build|develop|create|automate|integrate|implement)\b/i,
  /\b(?:build|develop|create|automate|integrate|implement)\b.{0,60}\b(?:app|software|tool|dashboard|api|agent|workflow|system|integration)\b/i,
  /\b(?:automation|ai|api|integration|dashboard|workflow) help\b/i,
];

const PAID_PATTERNS = [/\bpaid\b/i, /\bbudget\b/i, /\bcontract\b/i, /\bhourly\b/i, /\bbounty\b/i, /\$\s?\d/];
const OPERATIONAL_PATTERNS = [/manual/i, /hours? (?:a|per|every) week/i, /bottleneck/i, /miss(?:ed|ing)? (?:invoice|payment|order)/i, /copying .* between systems/i];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyBuyerIntent(text: string): BuyerIntentClassification {
  const indicators: string[] = [];
  const explicit = matchesAny(text, EXPLICIT_BUYER_PATTERNS);
  const buildNeed = matchesAny(text, BUILD_NEED_PATTERNS);
  const paid = matchesAny(text, PAID_PATTERNS);
  const operational = matchesAny(text, OPERATIONAL_PATTERNS);
  if (explicit) indicators.push('explicit-developer-request');
  if (buildNeed) indicators.push('specific-build-need');
  if (paid) indicators.push('commercial-intent');
  if (operational) indicators.push('operational-problem');

  let kind: BuyerIntentKind;
  if (explicit) kind = 'EXPLICIT_BUYER_REQUEST';
  else if (buildNeed) kind = 'SPECIFIC_BUILD_NEED';
  else if (operational) kind = 'OPERATIONAL_PROBLEM';
  else kind = 'WEAK_SIGNAL';

  let score = kind === 'EXPLICIT_BUYER_REQUEST' ? 0.65
    : kind === 'SPECIFIC_BUILD_NEED' ? 0.5
      : kind === 'OPERATIONAL_PROBLEM' ? 0.35
        : 0.1;
  if (paid) score += 0.25;
  if (buildNeed && kind === 'EXPLICIT_BUYER_REQUEST') score += 0.1;
  if (operational) score += 0.05;
  return { kind, score: Number(Math.min(1, score).toFixed(4)), indicators };
}

export type EconomicPainCategory =
  | 'LABOR_COST'
  | 'REVENUE_LEAK'
  | 'INTEGRATION_GAP'
  | 'WORKFLOW_FRICTION'
  | 'COMPLIANCE_RISK'
  | 'RELIABILITY_RISK'
  | 'CUSTOM_SOFTWARE';

export interface EconomicPainClassification {
  categories: EconomicPainCategory[];
  score: number;
  observedOnly: true;
  indicators: string[];
}

export function classifyEconomicPain(text: string): EconomicPainClassification {
  const categories = new Set<EconomicPainCategory>();
  const indicators: string[] = [];
  const lower = text.toLowerCase();
  if (/manual|copying|hours? (?:a|per|every) week|repetitive|staff time/.test(lower)) {
    categories.add('LABOR_COST'); indicators.push('observed-labor-burden');
  }
  if (/miss(?:ed|ing)? invoices?|lost revenue|revenue leak|unpaid|payment delay|churn/.test(lower)) {
    categories.add('REVENUE_LEAK'); indicators.push('observed-revenue-risk');
  }
  if (/between systems|integration|integrate|sync|copying .* systems|api/.test(lower)) {
    categories.add('INTEGRATION_GAP'); indicators.push('observed-system-gap');
  }
  if (/manual|bottleneck|slow process|repetitive|workflow/.test(lower)) {
    categories.add('WORKFLOW_FRICTION'); indicators.push('observed-workflow-friction');
  }
  if (/compliance|audit|regulatory|reporting requirement/.test(lower)) {
    categories.add('COMPLIANCE_RISK'); indicators.push('observed-compliance-risk');
  }
  if (/downtime|outage|failures?|errors?|unreliable/.test(lower)) {
    categories.add('RELIABILITY_RISK'); indicators.push('observed-reliability-risk');
  }
  if (/need .*\b(?:app|software|tool|dashboard|system)\b|custom (?:app|software|tool)/.test(lower)) {
    categories.add('CUSTOM_SOFTWARE'); indicators.push('observed-custom-software-need');
  }
  const quantified = /\b\d+(?:\.\d+)?\s*(?:hours?|days?|weeks?|%|percent|dollars?|usd|k)\b/i.test(text);
  const score = Math.min(1, categories.size * 0.18 + (quantified ? 0.2 : 0));
  return { categories: [...categories], score: Number(score.toFixed(4)), observedOnly: true, indicators };
}

export type ScamFlag = 'PAY_TO_APPLY' | 'CREDENTIAL_REQUEST' | 'OFF_PLATFORM_ONLY' | 'CRYPTO_ONLY' | 'IMPLAUSIBLE_PAYMENT';

export interface CredibilityScreen {
  credibilityScore: number;
  scamRiskScore: number;
  scamFlags: ScamFlag[];
  reject: boolean;
  reasons: string[];
}

export function screenDemandCredibility(observation: RawPublicDemandObservation): CredibilityScreen {
  const text = observationText(observation);
  const lower = text.toLowerCase();
  const scamFlags: ScamFlag[] = [];
  if (/application fee|pay .{0,30}(?:fee|deposit) to (?:apply|start)|pay-to-apply/.test(lower)) scamFlags.push('PAY_TO_APPLY');
  if (/send (?:your )?(?:credentials|password|api key|token)|share (?:your )?(?:password|credentials|api key|token)/.test(lower)) scamFlags.push('CREDENTIAL_REQUEST');
  if (/telegram only|contact only (?:on|via) telegram|whatsapp only/.test(lower)) scamFlags.push('OFF_PLATFORM_ONLY');
  if (/compensation in crypto|crypto only|paid only in crypto/.test(lower)) scamFlags.push('CRYPTO_ONLY');
  if (/\$\s?\d{7,}.{0,25}(?:one hour|few minutes|no experience)/.test(lower)) scamFlags.push('IMPLAUSIBLE_PAYMENT');

  let credibilityScore = 0.25;
  if (observation.verified) credibilityScore += 0.3;
  if (observation.authorId?.trim()) credibilityScore += 0.1;
  if (matchesAny(text, EXPLICIT_BUYER_PATTERNS) || matchesAny(text, BUILD_NEED_PATTERNS)) credibilityScore += 0.15;
  if (matchesAny(text, PAID_PATTERNS)) credibilityScore += 0.15;
  if (observation.verificationEvidenceRefs.length > 0) credibilityScore += 0.05;
  credibilityScore = Math.max(0, credibilityScore - scamFlags.length * 0.18);
  const scamRiskScore = Math.min(1, scamFlags.length * 0.3);
  const reject = scamFlags.includes('PAY_TO_APPLY') || scamFlags.includes('CREDENTIAL_REQUEST') || scamFlags.length >= 3;
  return {
    credibilityScore: Number(Math.min(1, credibilityScore).toFixed(4)),
    scamRiskScore: Number(scamRiskScore.toFixed(4)),
    scamFlags,
    reject,
    reasons: reject ? ['scam-screen-reject', ...scamFlags] : ['source-verified', 'no-hard-scam-trigger'],
  };
}

export interface PortfolioEvidence {
  id: string;
  title: string;
  description: string;
  skills: string[];
  verified: boolean;
}

export interface PortfolioMatch {
  id: string;
  score: number;
  matchedTerms: string[];
}

const STOP_TERMS = new Set(['a', 'an', 'and', 'for', 'i', 'in', 'of', 'on', 'or', 'the', 'to', 'we', 'with', 'build', 'need', 'looking', 'developer']);

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9+#.-]+/).map((term) => term.replace(/^[.-]+|[.-]+$/g, '')).filter((term) => term.length >= 2 && !STOP_TERMS.has(term)));
}

export function matchPortfolioEvidence(observation: RawPublicDemandObservation, evidence: PortfolioEvidence[]): PortfolioMatch[] {
  const demandTerms = tokenize(observationText(observation));
  return evidence
    .filter((item) => item.verified)
    .map((item) => {
      const itemTerms = tokenize(`${item.title} ${item.description} ${item.skills.join(' ')}`);
      const matchedTerms = [...demandTerms].filter((term) => itemTerms.has(term)).sort();
      const denominator = Math.max(1, Math.min(demandTerms.size, itemTerms.size));
      const score = Number(Math.min(1, matchedTerms.length / denominator * 2).toFixed(4));
      return { id: item.id, score, matchedTerms };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

export interface PublicDemandRankingInput {
  buyerIntentScore: number;
  economicPainScore: number;
  credibilityScore: number;
  scamRiskScore: number;
  portfolioMatchScore: number;
  freshnessScore: number;
  estimatedDeliveryEffort: number;
  observedBudgetMaxCents: number | null;
  budgetVerified: boolean;
}

export interface PublicDemandRanking {
  expectedValueScore: number;
  priority: 'PRIORITY_0' | 'STRONG' | 'MONITOR' | 'REJECT';
  escalationReasons: string[];
  components: Record<string, number | null | boolean>;
}

function clampUnit(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${field} must be between 0 and 1`);
  return value;
}

export function rankPublicDemandOpportunity(input: PublicDemandRankingInput): PublicDemandRanking {
  const buyerIntent = clampUnit(input.buyerIntentScore, 'buyerIntentScore');
  const pain = clampUnit(input.economicPainScore, 'economicPainScore');
  const credibility = clampUnit(input.credibilityScore, 'credibilityScore');
  const scam = clampUnit(input.scamRiskScore, 'scamRiskScore');
  const portfolio = clampUnit(input.portfolioMatchScore, 'portfolioMatchScore');
  const freshness = clampUnit(input.freshnessScore, 'freshnessScore');
  const effort = clampUnit(input.estimatedDeliveryEffort, 'estimatedDeliveryEffort');
  if (input.observedBudgetMaxCents !== null && (!Number.isInteger(input.observedBudgetMaxCents) || input.observedBudgetMaxCents < 0)) {
    throw new TypeError('observedBudgetMaxCents must be null or a non-negative integer');
  }

  const budgetValue = input.budgetVerified && input.observedBudgetMaxCents !== null
    ? Math.min(1, input.observedBudgetMaxCents / 10_000_000)
    : null;
  const valuePotential = budgetValue ?? Math.min(1, pain * 0.7 + buyerIntent * 0.3);
  const raw =
    buyerIntent * 0.25 +
    pain * 0.15 +
    credibility * 0.15 +
    portfolio * 0.2 +
    freshness * 0.1 +
    valuePotential * 0.15 -
    scam * 0.35 -
    effort * 0.1;
  const expectedValueScore = Number(Math.max(0, Math.min(1, raw)).toFixed(4));
  const escalationReasons: string[] = [];

  const verifiedHighValueBudget = input.budgetVerified
    && input.observedBudgetMaxCents !== null
    && input.observedBudgetMaxCents >= 10_000_000
    && buyerIntent >= 0.8
    && credibility >= 0.7
    && portfolio >= 0.7;
  if (verifiedHighValueBudget) escalationReasons.push('VERIFIED_HIGH_VALUE_BUDGET');
  if (pain >= 0.9 && buyerIntent >= 0.8 && portfolio >= 0.8 && credibility >= 0.8) escalationReasons.push('HIGH_CONFIDENCE_ECONOMIC_PAIN');

  let priority: PublicDemandRanking['priority'];
  if (scam >= 0.6 || credibility < 0.25) priority = 'REJECT';
  else if (verifiedHighValueBudget || expectedValueScore >= 0.85) priority = 'PRIORITY_0';
  else if (expectedValueScore >= 0.6) priority = 'STRONG';
  else if (expectedValueScore >= 0.3) priority = 'MONITOR';
  else priority = 'REJECT';

  return {
    expectedValueScore,
    priority,
    escalationReasons,
    components: {
      buyerIntent,
      pain,
      credibility,
      scam,
      portfolio,
      freshness,
      effort,
      budgetValue,
      budgetVerified: input.budgetVerified,
    },
  };
}

function parseObservedBudget(text: string): { maxCents: number | null; verified: boolean } {
  const matches = [...text.matchAll(/\$\s?([0-9][0-9,]*(?:\.\d{1,2})?)(\s?[kKmM])?/g)];
  if (matches.length === 0) return { maxCents: null, verified: false };
  const cents = matches.flatMap((match) => {
    const raw = Number((match[1] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(raw)) return [];
    const suffix = (match[2] ?? '').trim().toLowerCase();
    const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1;
    return [Math.round(raw * multiplier * 100)];
  });
  return cents.length === 0 ? { maxCents: null, verified: false } : { maxCents: Math.max(...cents), verified: true };
}

export interface PublicDemandCandidate {
  signal: DemandSignal;
  intent: BuyerIntentClassification;
  pain: EconomicPainClassification;
  credibility: CredibilityScreen;
  portfolioMatches: PortfolioMatch[];
  ranking: PublicDemandRanking;
  explanations: string[];
}

export function buildPublicDemandCandidate(input: {
  observation: RawPublicDemandObservation;
  sourceHealth: SourceHealthReport;
  portfolioEvidence: PortfolioEvidence[];
}): PublicDemandCandidate {
  const signal = normalizePublicDemandObservation(input.observation, input.sourceHealth);
  const text = observationText(input.observation);
  const intent = classifyBuyerIntent(text);
  const pain = classifyEconomicPain(text);
  const credibility = screenDemandCredibility(input.observation);
  const portfolioMatches = matchPortfolioEvidence(input.observation, input.portfolioEvidence);
  const budget = parseObservedBudget(text);
  const ranking = credibility.reject
    ? rankPublicDemandOpportunity({
        buyerIntentScore: intent.score,
        economicPainScore: pain.score,
        credibilityScore: credibility.credibilityScore,
        scamRiskScore: Math.max(0.6, credibility.scamRiskScore),
        portfolioMatchScore: portfolioMatches[0]?.score ?? 0,
        freshnessScore: input.sourceHealth.state === 'HEALTHY' ? 1 : 0.6,
        estimatedDeliveryEffort: 0.5,
        observedBudgetMaxCents: budget.maxCents,
        budgetVerified: budget.verified,
      })
    : rankPublicDemandOpportunity({
        buyerIntentScore: intent.score,
        economicPainScore: pain.score,
        credibilityScore: credibility.credibilityScore,
        scamRiskScore: credibility.scamRiskScore,
        portfolioMatchScore: portfolioMatches[0]?.score ?? 0,
        freshnessScore: input.sourceHealth.state === 'HEALTHY' ? 1 : 0.6,
        estimatedDeliveryEffort: portfolioMatches[0] ? Math.max(0.15, 0.65 - portfolioMatches[0].score * 0.4) : 0.65,
        observedBudgetMaxCents: budget.maxCents,
        budgetVerified: budget.verified,
      });

  const explanations = [
    `buyer-intent:${intent.kind}:${intent.score.toFixed(2)}`,
    `economic-pain:${pain.categories.join(',') || 'none'}:${pain.score.toFixed(2)}`,
    `credibility:${credibility.credibilityScore.toFixed(2)}:scam-risk:${credibility.scamRiskScore.toFixed(2)}`,
    `portfolio-match:${(portfolioMatches[0]?.score ?? 0).toFixed(2)}`,
    `priority:${ranking.priority}:ev:${ranking.expectedValueScore.toFixed(2)}`,
  ];

  return { signal, intent, pain, credibility, portfolioMatches, ranking, explanations };
}
