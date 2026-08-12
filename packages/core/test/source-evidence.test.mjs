import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertVerifiedMarketplaceOpportunityEvidence,
  marketplaceEvidenceId,
} from '../src/source.ts';

function validEvidence(overrides = {}) {
  return {
    platform: 'freelancer',
    platform_id: '42',
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
    retrieved_at: '2026-08-12T09:00:00Z',
    retrieval_method: 'freelancer_official_api',
    verified: true,
    raw_source: 'freelancer',
    ...overrides,
  };
}

test('verified marketplace evidence passes the source boundary and has stable identity', () => {
  const evidence = validEvidence();
  assert.doesNotThrow(() => assertVerifiedMarketplaceOpportunityEvidence(evidence));
  assert.equal(marketplaceEvidenceId(evidence), 'freelancer:42');
});

test('unverified source records cannot cross the evidence boundary', () => {
  assert.throws(
    () => assertVerifiedMarketplaceOpportunityEvidence(validEvidence({ verified: false })),
    /verified source evidence required/,
  );
});

test('source evidence rejects missing identity or provenance fields', () => {
  for (const field of ['platform', 'platform_id', 'title', 'source_url', 'retrieved_at', 'retrieval_method', 'raw_source']) {
    assert.throws(
      () => assertVerifiedMarketplaceOpportunityEvidence(validEvidence({ [field]: '   ' })),
      new RegExp(`${field} must be a non-blank string`),
    );
  }
  assert.throws(
    () => assertVerifiedMarketplaceOpportunityEvidence(validEvidence({ retrieved_at: 'not-a-date' })),
    /retrieved_at must be an ISO-8601 timestamp/,
  );
});

test('source evidence rejects invalid scalar and skill types', () => {
  assert.throws(
    () => assertVerifiedMarketplaceOpportunityEvidence(validEvidence({ budget_min: -1 })),
    /budget_min must be null or a non-negative finite number/,
  );
  assert.throws(
    () => assertVerifiedMarketplaceOpportunityEvidence(validEvidence({ bid_count: 1.5 })),
    /bid_count must be null or a non-negative integer/,
  );
  assert.throws(
    () => assertVerifiedMarketplaceOpportunityEvidence(validEvidence({ skills: ['Python', '  '] })),
    /skills must contain only non-blank strings/,
  );
});
