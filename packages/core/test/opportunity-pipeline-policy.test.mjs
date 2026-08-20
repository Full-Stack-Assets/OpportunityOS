import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../src/index.ts');

test('inbound search distinguishes new activity, verified no-match, and unverifiable failure', () => {
  assert.equal(typeof core.classifyInboundSearch, 'function');

  const newActivity = core.classifyInboundSearch({
    provider: 'gmail',
    attemptedAt: '2026-08-20T05:00:00Z',
    queryFingerprint: 'query:inbound',
    searchSucceeded: true,
    matchCount: 2,
    evidenceRefs: ['gmail:search:1'],
  });
  assert.equal(newActivity.state, 'NEW_INBOUND_ACTIVITY');
  assert.equal(newActivity.verified, true);

  const noMatch = core.classifyInboundSearch({
    provider: 'gmail',
    attemptedAt: '2026-08-20T05:01:00Z',
    queryFingerprint: 'query:none',
    searchSucceeded: true,
    matchCount: 0,
    evidenceRefs: ['gmail:search:2'],
  });
  assert.equal(noMatch.state, 'NO_MATCHING_INBOUND_ACTIVITY');
  assert.equal(noMatch.verified, true);

  const failed = core.classifyInboundSearch({
    provider: 'gmail',
    attemptedAt: '2026-08-20T05:02:00Z',
    queryFingerprint: 'query:failed',
    searchSucceeded: false,
    failureCode: 'failedPrecondition',
    failureDetail: 'search_failed_precondition',
    evidenceRefs: ['gmail:search:3'],
  });
  assert.equal(failed.state, 'UNVERIFIED');
  assert.equal(failed.verified, false);
  assert.equal(failed.failureClass, 'FAILED_PRECONDITION');
});

test('unknown evidence and geography lower pursuit tier instead of becoming automatic rejection', () => {
  assert.equal(typeof core.classifyPursuitTier, 'function');

  assert.equal(core.classifyPursuitTier({
    eligibilityState: 'ELIGIBLE',
    winProbability: 0.72,
    confidence: 0.8,
    unresolvedClarifications: [],
    hardExclusions: [],
  }).tier, 'STRONG_MATCH');

  assert.equal(core.classifyPursuitTier({
    eligibilityState: 'ELIGIBLE',
    winProbability: 0.5,
    confidence: 0.6,
    unresolvedClarifications: [],
    hardExclusions: [],
  }).tier, 'REALISTIC_CANDIDATE');

  assert.equal(core.classifyPursuitTier({
    eligibilityState: 'PARTIAL',
    winProbability: 0.28,
    confidence: 0.45,
    unresolvedClarifications: [],
    hardExclusions: [],
  }).tier, 'MODERATE_PLAUSIBLE');

  assert.equal(core.classifyPursuitTier({
    eligibilityState: 'PARTIAL',
    winProbability: 0.48,
    confidence: 0.55,
    unresolvedClarifications: ['LOCATION_UNCLEAR'],
    hardExclusions: [],
  }).tier, 'REQUIRES_CLARIFICATION');

  assert.equal(core.classifyPursuitTier({
    eligibilityState: 'UNKNOWN',
    winProbability: 0.12,
    confidence: 0.2,
    unresolvedClarifications: [],
    hardExclusions: [],
  }).tier, 'MONITORING_ONLY');

  const excluded = core.classifyPursuitTier({
    eligibilityState: 'DISQUALIFIED',
    winProbability: 0.8,
    confidence: 0.9,
    unresolvedClarifications: [],
    hardExclusions: ['UNPAID'],
  });
  assert.equal(excluded.tier, 'EXCLUDED');
});

test('connector route prefers approved API and only falls back to governed browser when permitted', () => {
  assert.equal(typeof core.resolveConnectorRoute, 'function');

  assert.equal(core.resolveConnectorRoute({
    apiAvailable: true,
    apiSufficient: true,
    browserAvailable: true,
    browserAutomationPermitted: true,
  }).route, 'OFFICIAL_API');

  assert.equal(core.resolveConnectorRoute({
    apiAvailable: true,
    apiSufficient: false,
    browserAvailable: true,
    browserAutomationPermitted: true,
  }).route, 'GOVERNED_BROWSER');

  const prohibitedFallback = core.resolveConnectorRoute({
    apiAvailable: false,
    apiSufficient: false,
    browserAvailable: true,
    browserAutomationPermitted: false,
  });
  assert.equal(prohibitedFallback.route, 'MANUAL_ONLY');
  assert.equal(prohibitedFallback.requiresEscalation, true);
});

test('auto-apply only authorizes candidates completely inside a verified Human Authority policy envelope', () => {
  assert.equal(typeof core.evaluateAutoApply, 'function');

  const base = {
    provider: 'freelancer',
    listingCurrent: true,
    previouslyPursued: false,
    compensationState: 'CONFIRMED',
    compensationCents: 50000,
    locationState: 'ALLOWED',
    skillFit: 0.8,
    winProbability: 0.62,
    candidacyConfidence: 0.72,
    applicationCostCents: 0,
    unsupportedClaims: [],
    requiredClarifications: [],
    connectorCanSubmit: true,
    platformConfirmationRequired: false,
    submissionsToday: 1,
    submissionsThisPlatformToday: 1,
    evidenceRefs: ['listing:1', 'portfolio:1'],
  };
  const policy = {
    policyId: 'auto-apply-v1',
    authorityVerified: true,
    enabled: true,
    allowedProviders: ['freelancer'],
    minimumCompensationCents: 10000,
    minimumSkillFit: 0.55,
    minimumWinProbability: 0.35,
    minimumCandidacyConfidence: 0.4,
    maximumApplicationCostCents: 0,
    dailySubmissionLimit: 20,
    perPlatformDailyLimit: 10,
  };

  assert.equal(core.evaluateAutoApply(base, policy).decision, 'AUTO_SUBMIT');
  assert.equal(core.evaluateAutoApply({...base, listingCurrent: false}, policy).decision, 'DENY');
  assert.equal(core.evaluateAutoApply({...base, previouslyPursued: true}, policy).decision, 'DENY');
  assert.equal(core.evaluateAutoApply({...base, compensationState: 'UNKNOWN'}, policy).decision, 'ESCALATE');
  assert.equal(core.evaluateAutoApply({...base, locationState: 'UNKNOWN'}, policy).decision, 'ESCALATE');
  assert.equal(core.evaluateAutoApply({...base, unsupportedClaims: ['3 years formal SaaS support']}, policy).decision, 'ESCALATE');
  assert.equal(core.evaluateAutoApply({...base, applicationCostCents: 1}, policy).decision, 'ESCALATE');
  assert.equal(core.evaluateAutoApply({...base, platformConfirmationRequired: true}, policy).decision, 'ESCALATE');
  assert.equal(core.evaluateAutoApply(base, {...policy, authorityVerified: false}).decision, 'PREPARE_ONLY');
});
