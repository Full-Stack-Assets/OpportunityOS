import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMAND_QUERY_LIBRARY_V1,
  getDemandQueryFamily,
  matchesDemandQueryFamily,
} from '../src/demand-queries.ts';

test('demand query families are unique, versioned, active, and source compatible', () => {
  const identities = DEMAND_QUERY_LIBRARY_V1.map((family) => `${family.id}@${family.version}`);
  assert.equal(new Set(identities).size, identities.length);
  assert.deepEqual(
    DEMAND_QUERY_LIBRARY_V1.map((family) => family.id),
    [
      'EXPLICIT_DEVELOPER_HIRE',
      'SOFTWARE_NEEDS_BUILDING',
      'AI_AUTOMATION_REQUEST',
      'INTEGRATION_PROBLEM',
      'MANUAL_PROCESS_PAIN',
      'REVENUE_LEAK',
      'DATA_REPORTING_PAIN',
      'RELIABILITY_FAILURE',
      'PAID_BOUNTY',
      'PROCUREMENT_OR_RFP',
      'MIGRATION_REQUEST',
      'MVP_PRODUCT_BUILD',
    ],
  );
  for (const family of DEMAND_QUERY_LIBRARY_V1) {
    assert.equal(family.version, '1.0.0');
    assert.equal(family.status, 'ACTIVE');
    assert.ok(family.compatibleProviders.length > 0);
    assert.ok(family.positivePatterns.length > 0);
    assert.ok(family.buyerIntentWeight >= 0 && family.buyerIntentWeight <= 1);
    assert.ok(family.economicPainWeight >= 0 && family.economicPainWeight <= 1);
  }
});

test('query lookup defaults to the active version and rejects unknown identities', () => {
  assert.equal(getDemandQueryFamily('AI_AUTOMATION_REQUEST').version, '1.0.0');
  assert.equal(getDemandQueryFamily('AI_AUTOMATION_REQUEST', '1.0.0').id, 'AI_AUTOMATION_REQUEST');
  assert.throws(() => getDemandQueryFamily('NOT_REAL'), /UNKNOWN_DEMAND_QUERY_FAMILY/);
  assert.throws(() => getDemandQueryFamily('AI_AUTOMATION_REQUEST', '9.9.9'), /UNKNOWN_DEMAND_QUERY_VERSION/);
});

test('local matching respects positive and exclusion patterns deterministically', () => {
  const hire = getDemandQueryFamily('EXPLICIT_DEVELOPER_HIRE');
  assert.equal(matchesDemandQueryFamily('Looking for a developer for a paid automation project', hire), true);
  assert.equal(matchesDemandQueryFamily('Developer tutorial: how to get hired as a software engineer', hire), false);

  const automation = getDemandQueryFamily('AI_AUTOMATION_REQUEST');
  assert.equal(matchesDemandQueryFamily('Need help automating our intake workflow with AI', automation), true);
  assert.equal(matchesDemandQueryFamily('A tutorial about AI automation patterns', automation), false);
});

test('GitHub-compatible active families expose provider-native query strings while HN uses local filtering', () => {
  for (const family of DEMAND_QUERY_LIBRARY_V1) {
    if (family.compatibleProviders.includes('github_issues')) {
      assert.ok((family.providerQueries.github_issues ?? []).length > 0, family.id);
    }
    if (family.compatibleProviders.includes('hacker_news')) {
      assert.deepEqual(family.providerQueries.hacker_news ?? [], [], `${family.id} must not pretend HN supports text search`);
    }
  }
});
