import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = await import('../src/index.ts');

test('inbound coverage falls back to a verified secondary mailbox without laundering an unverified primary', () => {
  assert.equal(typeof core.resolveInboundCoverage, 'function');

  const gmail = core.classifyInboundSearch({
    provider: 'gmail',
    attemptedAt: '2026-08-20T05:45:00Z',
    queryFingerprint: 'inbound:latest',
    searchSucceeded: false,
    failureCode: 'failedPrecondition',
    failureDetail: 'search_failed_precondition',
    evidenceRefs: ['live:gmail:search:failed-precondition'],
  });
  const outlook = core.classifyInboundSearch({
    provider: 'outlook',
    attemptedAt: '2026-08-20T05:45:10Z',
    queryFingerprint: 'inbound:latest',
    searchSucceeded: true,
    matchCount: 0,
    evidenceRefs: ['live:outlook:search:success'],
  });

  const coverage = core.resolveInboundCoverage([gmail, outlook], ['gmail', 'outlook']);
  assert.equal(coverage.primaryProvider, 'gmail');
  assert.equal(coverage.primaryState, 'UNVERIFIED');
  assert.equal(coverage.effectiveProvider, 'outlook');
  assert.equal(coverage.effectiveState, 'NO_MATCHING_INBOUND_ACTIVITY');
  assert.equal(coverage.coverageState, 'DEGRADED_VERIFIED_FALLBACK');
  assert.equal(coverage.fullyVerified, false);
});

test('inbound coverage uses the primary mailbox when it is verified and is unverifiable when every mailbox fails', () => {
  const gmail = core.classifyInboundSearch({
    provider: 'gmail', attemptedAt: '2026-08-20T05:45:00Z', queryFingerprint: 'q',
    searchSucceeded: true, matchCount: 1, evidenceRefs: ['gmail:ok'],
  });
  const outlook = core.classifyInboundSearch({
    provider: 'outlook', attemptedAt: '2026-08-20T05:45:01Z', queryFingerprint: 'q',
    searchSucceeded: true, matchCount: 0, evidenceRefs: ['outlook:ok'],
  });
  const primary = core.resolveInboundCoverage([gmail, outlook], ['gmail', 'outlook']);
  assert.equal(primary.coverageState, 'PRIMARY_VERIFIED');
  assert.equal(primary.effectiveProvider, 'gmail');
  assert.equal(primary.effectiveState, 'NEW_INBOUND_ACTIVITY');
  assert.equal(primary.fullyVerified, true);

  const failedGmail = core.classifyInboundSearch({
    provider: 'gmail', attemptedAt: '2026-08-20T05:46:00Z', queryFingerprint: 'q2',
    searchSucceeded: false, failureCode: 'failedPrecondition', evidenceRefs: ['gmail:failed'],
  });
  const failedOutlook = core.classifyInboundSearch({
    provider: 'outlook', attemptedAt: '2026-08-20T05:46:01Z', queryFingerprint: 'q2',
    searchSucceeded: false, failureCode: 'timeout', evidenceRefs: ['outlook:failed'],
  });
  const unavailable = core.resolveInboundCoverage([failedGmail, failedOutlook], ['gmail', 'outlook']);
  assert.equal(unavailable.coverageState, 'UNVERIFIED');
  assert.equal(unavailable.effectiveProvider, null);
  assert.equal(unavailable.effectiveState, 'UNVERIFIED');
  assert.equal(unavailable.fullyVerified, false);
});

test('auto-apply Human Authority template contains no invented thresholds and cannot authorize while incomplete', () => {
  assert.equal(typeof core.createDraftAutoApplyPolicyConfig, 'function');
  assert.equal(typeof core.materializeAutoApplyPolicyEnvelope, 'function');

  const draft = core.createDraftAutoApplyPolicyConfig('human-authority-opportunity-autoapply-v1');
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.enabled, false);
  assert.equal(draft.minimumCompensationCents, null);
  assert.equal(draft.minimumSkillFit, null);
  assert.equal(draft.minimumWinProbability, null);
  assert.equal(draft.minimumCandidacyConfidence, null);
  assert.equal(draft.maximumApplicationCostCents, null);
  assert.equal(draft.dailySubmissionLimit, null);
  assert.equal(draft.perPlatformDailyLimit, null);
  assert.deepEqual(draft.allowedProviders, []);

  const result = core.materializeAutoApplyPolicyEnvelope(draft);
  assert.equal(result.state, 'NOT_AUTHORIZED');
  assert.equal(result.envelope, null);
  assert.ok(result.missingFields.includes('authorityRef'));
  assert.ok(result.missingFields.includes('minimumCompensationCents'));
});

test('only a complete Human Authority-approved policy config materializes into an executable envelope', () => {
  const config = {
    policyId: 'approved-policy',
    status: 'AUTHORIZED',
    authorityRef: 'canon:approval:opportunity-autoapply:1',
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
  const result = core.materializeAutoApplyPolicyEnvelope(config);
  assert.equal(result.state, 'AUTHORIZED');
  assert.equal(result.envelope.authorityVerified, true);
  assert.equal(result.envelope.policyId, 'approved-policy');
  assert.deepEqual(result.envelope.allowedProviders, ['freelancer']);
});

test('current provider status manifest preserves live blockers and safe write boundaries', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../../config/opportunity-provider-status.current.json', import.meta.url), 'utf8'));
  assert.equal(manifest.schema_version, 'opportunity-provider-status/v1');
  assert.ok(Date.parse(manifest.observed_at));
  assert.ok(Date.parse(manifest.expires_at) > Date.parse(manifest.observed_at));

  assert.equal(manifest.providers.gmail.health, 'UNVERIFIED');
  assert.equal(manifest.providers.gmail.inbound_search, 'UNVERIFIED');
  assert.equal(manifest.providers.gmail.blocker, 'FAILED_PRECONDITION');
  assert.equal(manifest.providers.outlook.health, 'HEALTHY');
  assert.equal(manifest.providers.outlook.inbound_search, 'SUPPORTED');
  assert.equal(manifest.providers.contra.submit_application, 'CONFIRMATION_REQUIRED');
  assert.equal(manifest.providers.freelancer.submit_application, 'PERMISSION_REQUIRED');
  assert.equal(manifest.providers.upwork.browser_automation, 'PROHIBITED');
  assert.equal(manifest.providers.fiverr.submit_application, 'MANUAL_ONLY');
});

test('prepare-only application packages are deterministic and provider-neutral', () => {
  assert.equal(typeof core.prepareMarketplaceApplicationPackage, 'function');
  const input = {
    provider: 'upwork',
    opportunityId: 'opp:upwork:123',
    providerOpportunityId: '123',
    listingFingerprint: 'listing:abc',
    proposalText: 'I can implement the requested TypeScript API workflow and verify it against your acceptance criteria.',
    attachmentHashes: ['sha256:resume'],
    requiredFieldAnswers: {availability: '20 hours/week'},
    actionIntentId: 'action:prepare:123',
    evidenceRefs: ['listing:123', 'canon:resume:current'],
    unsupportedClaims: [],
    requiredClarifications: [],
  };
  const first = core.prepareMarketplaceApplicationPackage(input);
  const second = core.prepareMarketplaceApplicationPackage(input);
  assert.equal(first.state, 'PREPARED');
  assert.equal(first.submissionAllowed, false);
  assert.equal(first.package.provider, 'upwork');
  assert.equal(first.package.packageHash, second.package.packageHash);
  assert.equal(first.package.proposalTextHash, second.package.proposalTextHash);
  assert.ok(first.package.idempotencyKey.startsWith('application:'));
});

test('prepare-only package escalates unsupported claims or unresolved required fields instead of producing a submit-ready payload', () => {
  const result = core.prepareMarketplaceApplicationPackage({
    provider: 'fiverr',
    opportunityId: 'opp:fiverr:1',
    providerOpportunityId: 'request:1',
    listingFingerprint: 'listing:def',
    proposalText: 'Prepared response.',
    attachmentHashes: [],
    requiredFieldAnswers: {},
    actionIntentId: 'action:prepare:fiverr:1',
    evidenceRefs: ['source:fiverr:request:1'],
    unsupportedClaims: ['five years formal enterprise SaaS experience'],
    requiredClarifications: ['budget currency'],
  });
  assert.equal(result.state, 'NEEDS_REVIEW');
  assert.equal(result.package, null);
  assert.equal(result.submissionAllowed, false);
  assert.ok(result.reasons.includes('UNSUPPORTED_CLAIM'));
  assert.ok(result.reasons.includes('REQUIRED_CLARIFICATION'));
});

test('persisted Human Authority template is non-executable until explicitly completed and authorized', () => {
  const template = JSON.parse(fs.readFileSync(new URL('../../../config/auto-apply-policy.human-authority.template.json', import.meta.url), 'utf8'));
  assert.equal(template.status, 'DRAFT');
  assert.equal(template.enabled, false);
  assert.equal(template.authorityRef, null);
  assert.deepEqual(template.allowedProviders, []);
  assert.equal(template.minimumCompensationCents, null);
  assert.equal(template.minimumWinProbability, null);
  assert.equal(template.maximumApplicationCostCents, null);
});