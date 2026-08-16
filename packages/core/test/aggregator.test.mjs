import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aggregateOpportunities} from '../src/aggregator.ts';
import {rankOpportunities} from '../src/opportunity.ts';

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

function scoring(evidence_id, overrides = {}) {
  return {
    evidence_id,
    capabilityFit: 80,
    evidenceQuality: 90,
    effortPoints: 2,
    deadlineUrgency: 40,
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
  const serviceListing = evidence({platform: 'fiverr', platform_id: 'gig-1', record_kind: 'service_listing', source_url: 'https://www.fiverr.com/seller/gig', raw_source: 'fiverr'});
  const unverified = evidence({platform_id: '43', verified: false});
  const invalid = evidence({platform_id: '44', title: '   '});
  const result = aggregateOpportunities([buyer, serviceListing, unverified, invalid], []);
  assert.equal(result.accepted[0].evidence_id, 'freelancer:42');
  assert.equal(result.accepted[0].ranking_disposition, 'missing_scoring_inputs');
  assert.equal(result.intelligence[0].evidence_id, 'fiverr:gig-1');
  assert.deepEqual(result.rejected.map((item) => item.reason), ['unverified_source', 'invalid_source_contract']);
  assert.deepEqual(result.stats, {received: 4, verified: 2, buyerOpportunities: 1, serviceListings: 1, duplicates: 0, rejected: 2, invalidScoringInputs: 0, unusedScoringInputs: 0, rankEligible: 0, shortlisted: 0});
});

test('exact identity duplicates retain newest record and emit deterministic receipt', () => {
  const old = evidence({retrieved_at: '2026-08-12T12:00:00Z', source_url: 'https://example.com/a'});
  const fresh = evidence({retrieved_at: '2026-08-12T14:00:00Z', source_url: 'https://example.com/b'});
  const result = aggregateOpportunities([old, fresh], []);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].evidence.source_url, 'https://example.com/b');
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].reason, 'exact_identity');
  assert.equal(result.duplicates[0].duplicate_input_index, 0);
});

test('source-equivalent same-platform buyers dedupe but cross-platform and fuzzy titles remain distinct', () => {
  const a = evidence({platform_id: 'a', title: '  Build   API  ', source_url: 'https://example.com/job/?x=1#top'});
  const b = evidence({platform_id: 'b', title: 'build api', source_url: 'https://example.com/job'});
  const cross = evidence({platform: 'other', platform_id: 'c', title: 'build api', source_url: 'https://example.com/job'});
  const fuzzy = evidence({platform_id: 'd', title: 'build an api', source_url: 'https://example.com/job'});
  const result = aggregateOpportunities([a, b, cross, fuzzy], []);
  assert.equal(result.duplicates.filter((x) => x.reason === 'source_equivalent').length, 1);
  assert.deepEqual(result.accepted.map((x) => x.evidence_id), ['freelancer:b', 'freelancer:d', 'other:c']);
});

test('invalid, duplicate, missing, unused, and service-listing scoring rows are handled locally', () => {
  const buyer = evidence();
  const secondBuyer = evidence({platform_id: '43', source_url: 'https://example.com/43', title: 'Second job'});
  const service = evidence({platform: 'fiverr', platform_id: 'gig-1', record_kind: 'service_listing', source_url: 'https://www.fiverr.com/seller/gig', raw_source: 'fiverr'});
  const rows = [
    scoring('freelancer:42'),
    scoring('freelancer:42', {capabilityFit: 70}),
    scoring('ghost:1'),
    scoring('fiverr:gig-1'),
    {...scoring('freelancer:43'), evidence_id: ''},
  ];
  const result = aggregateOpportunities([buyer, secondBuyer, service], rows);
  const byId = Object.fromEntries(result.accepted.map((x) => [x.evidence_id, x]));
  assert.equal(byId['freelancer:42'].ranking_disposition, 'duplicate_scoring_inputs');
  assert.equal(byId['freelancer:43'].ranking_disposition, 'missing_scoring_inputs');
  assert.equal(result.invalidScoringInputs.length, 1);
  assert.equal(result.stats.invalidScoringInputs, 1);
  assert.equal(result.stats.unusedScoringInputs, 2);
  assert.equal(result.stats.rankEligible, 0);
});

test('rank eligible buyers reuse existing ranker and shortlist deterministically', () => {
  const records = [
    evidence({platform_id: '1', title: 'One', source_url: 'https://example.com/1'}),
    evidence({platform_id: '2', title: 'Two', source_url: 'https://example.com/2'}),
    evidence({platform_id: '3', title: 'Three', source_url: 'https://example.com/3'}),
  ];
  const rows = [
    scoring('freelancer:1', {capabilityFit: 90, evidenceQuality: 90, effortPoints: 1, deadlineUrgency: 80, expectedValueCents: 100000}),
    scoring('freelancer:2', {capabilityFit: 70, evidenceQuality: 80, effortPoints: 2, deadlineUrgency: 50}),
    scoring('freelancer:3', {capabilityFit: 60, evidenceQuality: 70, effortPoints: 3, deadlineUrgency: 40, expectedValueCents: 50000}),
  ];
  const expected = rankOpportunities(rows.map((row) => ({id: row.evidence_id, capabilityFit: row.capabilityFit, evidenceQuality: row.evidenceQuality, expectedValueCents: row.expectedValueCents, effortPoints: row.effortPoints, deadlineUrgency: row.deadlineUrgency})));
  const result = aggregateOpportunities(records, rows, {shortlistLimit: 2});
  assert.deepEqual(result.shortlist.map((x) => [x.evidence_id, x.score]), expected.slice(0, 2).map((x) => [x.id, x.score]));
  assert.equal(result.stats.rankEligible, 3);
  assert.equal(result.stats.shortlisted, 2);
  const dispositions = Object.fromEntries(result.accepted.map((x) => [x.evidence_id, x.ranking_disposition]));
  assert.equal(dispositions[expected[0].id], 'shortlisted');
  assert.equal(dispositions[expected[1].id], 'shortlisted');
  assert.equal(dispositions[expected[2].id], 'ranked_not_shortlisted');
  assert.equal(rows[1].expectedValueCents, undefined);
});

test('aggregation is deterministic and does not mutate inputs', () => {
  const records = [evidence({platform_id: '2', source_url: 'https://example.com/2'}), evidence({platform_id: '1', source_url: 'https://example.com/1'})];
  const rows = [scoring('freelancer:2'), scoring('freelancer:1')];
  const originalRecords = structuredClone(records);
  const originalRows = structuredClone(rows);
  const first = aggregateOpportunities(records, rows);
  const second = aggregateOpportunities(records, rows);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(records, originalRecords);
  assert.deepEqual(rows, originalRows);
  assert.deepEqual(first.accepted.map((x) => x.evidence_id), ['freelancer:1', 'freelancer:2']);
});

test('aggregator source stays inside pure core boundary', () => {
  const source = readFileSync(new URL('../src/aggregator.ts', import.meta.url), 'utf8');
  for (const prohibited of ['connectors/', "from 'mcp", 'requests', 'fetch(', 'postgres', 'createWorkOrder', 'BuildGraphClient', 'authorizeAction', 'executeFactory', 'send_message', 'purchase', 'payment']) {
    assert.equal(source.includes(prohibited), false, `prohibited dependency/reference: ${prohibited}`);
  }
});