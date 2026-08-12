import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateOpportunities} from '../src/aggregator.ts';

function evidence(overrides = {}) {
  return {
    platform: 'freelancer',
    platform_id: '42',
    record_kind: 'buyer_opportunity',
    title: 'Build a Python data pipeline',
    description: 'Need ETL automation',
    budget_min: 250,
    budget_max: 800,
    currency: 'AUD',
    bid_count: 7,
    skills: ['Python'],
    employer_id: '99',
    deadline: null,
    source_url: 'https://www.freelancer.com/projects/python/build-python-data-pipeline',
    retrieved_at: '2026-08-12T13:00:00Z',
    retrieval_method: 'freelancer_official_api',
    verified: true,
    raw_source: 'freelancer',
    ...overrides,
  };
}

test('top-level aggregator arguments and shortlist limit are validated before processing', () => {
  assert.throws(() => aggregateOpportunities(null, []), /evidence must be an array/);
  assert.throws(() => aggregateOpportunities([], null), /scoringInputs must be an array/);
  assert.throws(() => aggregateOpportunities([], [], null), /options must be an object/);
  assert.throws(() => aggregateOpportunities([], [], {shortlistLimit: 0}), /shortlistLimit/);
  assert.throws(() => aggregateOpportunities([], [], {shortlistLimit: 101}), /shortlistLimit/);
  assert.throws(() => aggregateOpportunities([], [], {shortlistLimit: 1.5}), /shortlistLimit/);
});

test('verified buyers, service listings, unverified records, and invalid records are classified independently', () => {
  const buyer = evidence();
  const serviceListing = evidence({
    platform: 'fiverr',
    platform_id: 'gig-1',
    record_kind: 'service_listing',
    source_url: 'https://www.fiverr.com/seller/gig',
    raw_source: 'fiverr',
  });
  const unverified = evidence({platform_id: '43', verified: false});
  const invalid = evidence({platform_id: '44', title: '   '});

  const result = aggregateOpportunities([buyer, serviceListing, unverified, invalid], []);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].evidence_id, 'freelancer:42');
  assert.equal(result.accepted[0].primary_disposition, 'accepted_buyer');
  assert.equal(result.accepted[0].ranking_disposition, 'missing_scoring_inputs');

  assert.equal(result.intelligence.length, 1);
  assert.equal(result.intelligence[0].evidence_id, 'fiverr:gig-1');
  assert.equal(result.intelligence[0].reason, 'service_listing');

  assert.deepEqual(result.rejected.map((item) => item.reason), [
    'unverified_source',
    'invalid_source_contract',
  ]);

  assert.deepEqual(result.duplicates, []);
  assert.deepEqual(result.invalidScoringInputs, []);
  assert.deepEqual(result.shortlist, []);
  assert.deepEqual(result.stats, {
    received: 4,
    verified: 2,
    buyerOpportunities: 1,
    serviceListings: 1,
    duplicates: 0,
    rejected: 2,
    invalidScoringInputs: 0,
    unusedScoringInputs: 0,
    rankEligible: 0,
    shortlisted: 0,
  });
});
