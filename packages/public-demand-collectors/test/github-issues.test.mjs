import test from 'node:test';
import assert from 'node:assert/strict';
import {getDemandQueryFamily} from '@opportunityos/core';
import {collectGitHubIssues} from '../src/github-issues.ts';

const NOW = '2026-08-16T16:50:00Z';

function oneQueryFamily(id = 'EXPLICIT_DEVELOPER_HIRE') {
  const base = getDemandQueryFamily(id);
  return {
    ...base,
    providerQueries: {
      ...base.providerQueries,
      github_issues: ['"looking for a developer"'],
    },
  };
}

function issue(overrides = {}) {
  return {
    id: 123,
    number: 77,
    state: 'open',
    title: 'Looking for a developer to build an AI intake automation',
    body: 'Paid contract. Budget $25k-$40k. Need CRM routing automation.',
    html_url: 'https://github.com/acme/ops/issues/77',
    repository_url: 'https://api.github.com/repos/acme/ops',
    created_at: '2026-08-16T14:00:00Z',
    updated_at: '2026-08-16T14:30:00Z',
    user: {login: 'buyer'},
    labels: [{name: 'help wanted'}],
    ...overrides,
  };
}

function searchResponse(items, status = 200, headers = {}) {
  return new Response(JSON.stringify({total_count: items.length, items}), {
    status,
    headers: {'content-type': 'application/json', ...headers},
  });
}

function collectorInput(overrides = {}) {
  return {
    family: oneQueryFamily(),
    limit: 25,
    pageLimit: 1,
    fetchFn: async () => searchResponse([issue()]),
    now: () => NOW,
    ...overrides,
  };
}

test('GitHub Issues official API collector emits a verified query-attributed observation', async () => {
  const calls = [];
  const result = await collectGitHubIssues(collectorInput({
    fetchFn: async (url, init) => {
      calls.push({url: String(url), init});
      return searchResponse([issue()], 200, {'x-ratelimit-remaining': '4999'});
    },
  }));

  assert.equal(result.health.state, 'HEALTHY');
  assert.equal(result.observations.length, 1);
  const observation = result.observations[0];
  assert.equal(observation.provider, 'github_issues');
  assert.equal(observation.sourceType, 'github_issue');
  assert.equal(observation.externalId, 'acme/ops#77');
  assert.equal(observation.canonicalUrl, 'https://github.com/acme/ops/issues/77');
  assert.equal(observation.retrievalMethod, 'official_api');
  assert.equal(observation.verified, true);
  assert.equal(observation.queryFamilyId, 'EXPLICIT_DEVELOPER_HIRE');
  assert.equal(observation.queryVersion, '1.0.0');
  assert.equal(observation.sourceMetadata.repository, 'acme/ops');
  assert.deepEqual(observation.sourceMetadata.labels, ['help wanted']);
  assert.deepEqual(observation.verificationEvidenceRefs, ['github-api:acme/ops#77']);
  assert.equal(result.receipt.recordsObserved, 1);
  assert.equal(result.receipt.recordsVerified, 1);
  assert.equal(result.receipt.signalsEmitted, 1);
  assert.equal(result.receipt.queryFamilyId, 'EXPLICIT_DEVELOPER_HIRE');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/search\/issues\?/);
  assert.match(decodeURIComponent(calls[0].url), /is:issue/);
  assert.match(decodeURIComponent(calls[0].url), /state:open/);
});

test('GitHub collector rejects pull requests, closed issues, malformed items, and local query mismatches', async () => {
  const result = await collectGitHubIssues(collectorInput({
    fetchFn: async () => searchResponse([
      issue({id: 1, number: 1, pull_request: {url: 'https://api.github.com/repos/acme/ops/pulls/1'}}),
      issue({id: 2, number: 2, state: 'closed'}),
      issue({id: 3, number: 3, title: ''}),
      issue({id: 4, number: 4, title: 'Routine dependency update', body: 'No buyer request here.'}),
    ]),
  }));

  assert.deepEqual(result.observations, []);
  assert.equal(result.health.state, 'DEGRADED');
  assert.deepEqual(result.rejected.map((item) => item.reason), [
    'PULL_REQUEST_NOT_ISSUE',
    'ISSUE_NOT_OPEN',
    'INVALID_ISSUE_SCHEMA',
    'QUERY_FAMILY_NO_MATCH',
  ]);
  assert.equal(result.receipt.recordsObserved, 4);
  assert.equal(result.receipt.recordsRejected, 4);
  assert.equal(result.receipt.signalsEmitted, 0);
});

test('GitHub authentication and rate-limit failures emit zero verified observations', async () => {
  const unauthorized = await collectGitHubIssues(collectorInput({
    token: 'ghp_never_return_this',
    fetchFn: async () => new Response(JSON.stringify({message: 'Bad credentials'}), {status: 401}),
  }));
  assert.equal(unauthorized.health.state, 'AUTH_REQUIRED');
  assert.deepEqual(unauthorized.observations, []);
  assert.equal(JSON.stringify(unauthorized).includes('ghp_never_return_this'), false);

  const forbiddenRateLimit = await collectGitHubIssues(collectorInput({
    fetchFn: async () => new Response(JSON.stringify({message: 'rate limit'}), {
      status: 403,
      headers: {'x-ratelimit-remaining': '0'},
    }),
  }));
  assert.equal(forbiddenRateLimit.health.state, 'RATE_LIMITED');
  assert.deepEqual(forbiddenRateLimit.observations, []);

  const tooMany = await collectGitHubIssues(collectorInput({
    fetchFn: async () => new Response(JSON.stringify({message: 'slow down'}), {status: 429}),
  }));
  assert.equal(tooMany.health.state, 'RATE_LIMITED');
  assert.deepEqual(tooMany.observations, []);
});

test('GitHub network, upstream, and schema failures fail closed', async () => {
  const network = await collectGitHubIssues(collectorInput({
    fetchFn: async () => { throw new Error('network down'); },
  }));
  assert.equal(network.health.state, 'UNAVAILABLE');
  assert.deepEqual(network.observations, []);

  const upstream = await collectGitHubIssues(collectorInput({
    fetchFn: async () => new Response(JSON.stringify({message: 'server error'}), {status: 500}),
  }));
  assert.equal(upstream.health.state, 'UNAVAILABLE');
  assert.deepEqual(upstream.observations, []);

  const schema = await collectGitHubIssues(collectorInput({
    fetchFn: async () => new Response(JSON.stringify({unexpected: []}), {status: 200}),
  }));
  assert.equal(schema.health.state, 'SCHEMA_DRIFT');
  assert.deepEqual(schema.observations, []);
});

test('GitHub token is request-only and never enters output or collector receipts', async () => {
  let authorizationHeader = null;
  const token = 'github_secret_value';
  const result = await collectGitHubIssues(collectorInput({
    token,
    fetchFn: async (_url, init) => {
      const headers = new Headers(init?.headers);
      authorizationHeader = headers.get('authorization');
      return searchResponse([issue()]);
    },
  }));
  assert.equal(authorizationHeader, `Bearer ${token}`);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(result.receipt.credentialMode, 'authenticated');
});

test('GitHub collector validates bounded limits before network access', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return searchResponse([]); };
  await assert.rejects(() => collectGitHubIssues(collectorInput({limit: 0, fetchFn})), /limit/);
  await assert.rejects(() => collectGitHubIssues(collectorInput({limit: 101, fetchFn})), /limit/);
  await assert.rejects(() => collectGitHubIssues(collectorInput({pageLimit: 0, fetchFn})), /pageLimit/);
  await assert.rejects(() => collectGitHubIssues(collectorInput({pageLimit: 11, fetchFn})), /pageLimit/);
  assert.equal(calls, 0);
});
