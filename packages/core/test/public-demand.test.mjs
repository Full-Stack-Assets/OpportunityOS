import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_DEMAND_SOURCE_PROFILES,
  assessSourceHealth,
  buildPublicDemandCandidate,
  classifyBuyerIntent,
  classifyEconomicPain,
  matchPortfolioEvidence,
  normalizePublicDemandObservation,
  rankPublicDemandOpportunity,
  screenDemandCredibility,
} from '../src/public-demand.ts';

function observation(overrides = {}) {
  return {
    provider: 'reddit',
    sourceType: 'reddit_post',
    externalId: 't3_example',
    canonicalUrl: 'https://www.reddit.com/r/forhire/comments/example/need_a_developer/',
    title: 'Need a developer to build an AI intake automation',
    body: 'Looking for a developer to automate intake and CRM routing. Paid contract. Budget $8,000.',
    authorId: 'user-123',
    observedAt: '2026-08-16T14:00:00Z',
    retrievedAt: '2026-08-16T14:01:00Z',
    retrievalMethod: 'official_api',
    verified: true,
    verificationEvidenceRefs: ['reddit-api:t3_example'],
    ...overrides,
  };
}

test('public demand source catalog includes required and additional high-intent public sources', () => {
  const providers = new Set(Object.keys(PUBLIC_DEMAND_SOURCE_PROFILES));
  for (const required of ['reddit', 'hacker_news', 'github_issues', 'github_discussions']) {
    assert.equal(providers.has(required), true, `missing source profile ${required}`);
  }
  assert.equal(providers.has('devto'), true);
  assert.equal(providers.has('discourse'), true);
  for (const profile of Object.values(PUBLIC_DEMAND_SOURCE_PROFILES)) {
    assert.equal(profile.writeEnabled, false);
    assert.ok(profile.allowedRetrievalMethods.length > 0);
  }
});

test('normalization preserves provenance and refuses unverified or unsupported retrieval', () => {
  const health = assessSourceHealth('reddit', {
    configured: true,
    verificationSucceeded: true,
    verifiedAt: '2026-08-16T14:01:00Z',
    error: null,
  });
  const normalized = normalizePublicDemandObservation(observation(), health);
  assert.equal(normalized.sourceProvider, 'reddit');
  assert.equal(normalized.verificationState, 'VERIFIED');
  assert.equal(normalized.rawSourceRef, 'reddit-api:t3_example');
  assert.ok(normalized.provenanceRefs.includes('reddit-api:t3_example'));
  assert.throws(() => normalizePublicDemandObservation(observation({verified: false}), health), /SOURCE_NOT_VERIFIED/);
  assert.throws(() => normalizePublicDemandObservation(observation({retrievalMethod: 'browser_cookie_scrape'}), health), /RETRIEVAL_METHOD_NOT_ALLOWED/);
});

test('source health fails closed when a source is not configured or verification failed', () => {
  const unavailable = assessSourceHealth('reddit', {
    configured: false,
    verificationSucceeded: false,
    verifiedAt: null,
    error: 'missing oauth',
  });
  assert.equal(unavailable.state, 'UNAVAILABLE');
  assert.throws(() => normalizePublicDemandObservation(observation(), unavailable), /SOURCE_UNAVAILABLE/);

  const degraded = assessSourceHealth('hacker_news', {
    configured: true,
    verificationSucceeded: false,
    verifiedAt: '2026-08-16T13:00:00Z',
    error: 'upstream timeout',
  });
  assert.equal(degraded.state, 'DEGRADED');
});

test('buyer-intent detection distinguishes explicit paid requests from weak discussion', () => {
  const explicit = classifyBuyerIntent('Looking for a developer to build an internal dashboard. Paid contract, budget $12k.');
  const weak = classifyBuyerIntent('Curious what people think about AI dashboards someday.');
  assert.equal(explicit.kind, 'EXPLICIT_BUYER_REQUEST');
  assert.ok(explicit.score >= 0.8);
  assert.ok(explicit.score > weak.score);
  assert.equal(weak.kind, 'WEAK_SIGNAL');
});

test('problem classifier surfaces economic pain without claiming unseen internal facts', () => {
  const result = classifyEconomicPain('We spend 30 hours every week copying orders between systems and miss invoices.');
  assert.ok(result.categories.includes('LABOR_COST'));
  assert.ok(result.categories.includes('REVENUE_LEAK'));
  assert.ok(result.categories.includes('INTEGRATION_GAP'));
  assert.equal(result.observedOnly, true);
});

test('credibility and scam screening penalizes payment-to-apply and off-platform crypto schemes', () => {
  const credible = screenDemandCredibility(observation());
  assert.ok(credible.credibilityScore > 0.6);
  assert.equal(credible.reject, false);

  const scam = screenDemandCredibility(observation({
    body: 'Pay a $300 application fee, contact only on Telegram, compensation in crypto after you send credentials.',
  }));
  assert.equal(scam.reject, true);
  assert.ok(scam.scamFlags.includes('PAY_TO_APPLY'));
  assert.ok(scam.scamFlags.includes('CREDENTIAL_REQUEST'));
});

test('portfolio matching uses verified repository/artifact evidence only', () => {
  const matches = matchPortfolioEvidence(
    observation(),
    [
      {id: 'repo:opportunityos', title: 'OpportunityOS', description: 'AI workflow automation and opportunity intelligence', skills: ['TypeScript', 'AI', 'automation'], verified: true},
      {id: 'repo:hostgraph', title: 'HostGraph', description: 'procurement margin intelligence', skills: ['analytics'], verified: true},
      {id: 'repo:imaginary', title: 'Imaginary AI', description: 'perfect AI automation', skills: ['AI', 'automation'], verified: false},
    ],
  );
  assert.equal(matches[0].id, 'repo:opportunityos');
  assert.equal(matches.some((match) => match.id === 'repo:imaginary'), false);
  assert.ok(matches[0].score > 0);
});

test('expected-value ranking escalates strong high-value verified demand to Priority 0', () => {
  const ranking = rankPublicDemandOpportunity({
    buyerIntentScore: 1,
    economicPainScore: 0.9,
    credibilityScore: 0.9,
    scamRiskScore: 0,
    portfolioMatchScore: 0.95,
    freshnessScore: 1,
    estimatedDeliveryEffort: 0.2,
    observedBudgetMaxCents: 15000000,
    budgetVerified: true,
  });
  assert.equal(ranking.priority, 'PRIORITY_0');
  assert.ok(ranking.expectedValueScore >= 0.8);
  assert.ok(ranking.escalationReasons.includes('VERIFIED_HIGH_VALUE_BUDGET'));
});

test('complete public-demand candidate is provenance-backed, explainable, and fail-closed', () => {
  const candidate = buildPublicDemandCandidate({
    observation: observation(),
    sourceHealth: assessSourceHealth('reddit', {
      configured: true,
      verificationSucceeded: true,
      verifiedAt: '2026-08-16T14:01:00Z',
      error: null,
    }),
    portfolioEvidence: [
      {id: 'repo:opportunityos', title: 'OpportunityOS', description: 'AI workflow automation', skills: ['AI', 'automation'], verified: true},
    ],
  });
  assert.equal(candidate.signal.verificationState, 'VERIFIED');
  assert.equal(candidate.intent.kind, 'EXPLICIT_BUYER_REQUEST');
  assert.equal(candidate.credibility.reject, false);
  assert.ok(candidate.portfolioMatches.length >= 1);
  assert.ok(['PRIORITY_0', 'STRONG', 'MONITOR', 'REJECT'].includes(candidate.ranking.priority));
  assert.ok(candidate.explanations.length > 0);
});
