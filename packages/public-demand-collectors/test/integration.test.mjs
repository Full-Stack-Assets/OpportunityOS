import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assessSourceHealth,
  buildPublicDemandCandidate,
  getDemandQueryFamily,
} from '@opportunityos/core';
import {collectGitHubIssues} from '../src/github-issues.ts';
import {collectHackerNews} from '../src/hacker-news.ts';

const NOW = '2026-08-16T17:20:00Z';

function githubFamily() {
  const base = getDemandQueryFamily('EXPLICIT_DEVELOPER_HIRE');
  return {
    ...base,
    providerQueries: {
      ...base.providerQueries,
      github_issues: ['"looking for a developer"'],
    },
  };
}

function githubSearchResponse(body = 'Paid contract. Budget $25k-$40k. Need AI intake and CRM routing automation.') {
  return new Response(JSON.stringify({
    total_count: 1,
    items: [{
      id: 123,
      number: 77,
      state: 'open',
      title: 'Looking for a developer to build an AI intake automation',
      body,
      html_url: 'https://github.com/acme/ops/issues/77',
      repository_url: 'https://api.github.com/repos/acme/ops',
      created_at: '2026-08-16T14:00:00Z',
      updated_at: '2026-08-16T14:30:00Z',
      user: {login: 'buyer'},
      labels: [{name: 'help wanted'}],
    }],
  }), {status: 200, headers: {'content-type': 'application/json'}});
}

test('verified GitHub collector output flows into existing OpportunityOS demand intelligence', async () => {
  const collected = await collectGitHubIssues({
    family: githubFamily(),
    limit: 25,
    pageLimit: 1,
    now: () => NOW,
    fetchFn: async () => githubSearchResponse(),
  });

  assert.equal(collected.observations.length, 1);
  const sourceHealth = assessSourceHealth('github_issues', {
    configured: true,
    verificationSucceeded: collected.health.state === 'HEALTHY' || collected.health.state === 'DEGRADED',
    verifiedAt: NOW,
    error: null,
  });
  const candidate = buildPublicDemandCandidate({
    observation: collected.observations[0],
    sourceHealth,
    portfolioEvidence: [{
      id: 'repo:opportunityos',
      title: 'OpportunityOS',
      description: 'AI workflow automation and opportunity intelligence',
      skills: ['AI', 'automation', 'TypeScript'],
      verified: true,
    }],
  });

  assert.equal(candidate.signal.verificationState, 'VERIFIED');
  assert.equal(candidate.intent.kind, 'EXPLICIT_BUYER_REQUEST');
  assert.equal(collected.receipt.signalsEmitted, 1);
  assert.equal(candidate.signal.rawSourceRef, 'github-api:acme/ops#77');
  assert.ok(candidate.portfolioMatches.length >= 1);
});

test('seven-figure source language is preserved verbatim for later P0-Critical commercial analysis', async () => {
  const body = 'Paid contract. Approved project budget $1.4M for a custom automation and integration build.';
  const collected = await collectGitHubIssues({
    family: githubFamily(),
    limit: 25,
    pageLimit: 1,
    now: () => NOW,
    fetchFn: async () => githubSearchResponse(body),
  });
  assert.equal(collected.observations.length, 1);
  assert.equal(collected.observations[0].body, body);
  assert.equal(collected.observations[0].sourceMetadata.repository, 'acme/ops');
});

test('rate-limited GitHub and failed HN runs cannot manufacture a candidate', async () => {
  const github = await collectGitHubIssues({
    family: githubFamily(),
    limit: 25,
    pageLimit: 1,
    now: () => NOW,
    fetchFn: async () => new Response('slow down', {status: 429}),
  });
  assert.equal(github.health.state, 'RATE_LIMITED');
  assert.deepEqual(github.observations, []);

  const hackerNews = await collectHackerNews({
    family: getDemandQueryFamily('AI_AUTOMATION_REQUEST'),
    storySources: ['ask'],
    storyLimit: 10,
    commentsPerStory: 0,
    now: () => NOW,
    fetchFn: async () => new Response('unavailable', {status: 503}),
  });
  assert.equal(hackerNews.health.state, 'UNAVAILABLE');
  assert.deepEqual(hackerNews.observations, []);

  assert.equal(github.observations[0], undefined);
  assert.equal(hackerNews.observations[0], undefined);
});

test('live collector source contains no provider-write or consequential-action methods', () => {
  const sources = [
    readFileSync(new URL('../src/github-issues.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/hacker-news.ts', import.meta.url), 'utf8'),
  ].join('\n');

  for (const prohibited of [
    "method: 'POST'",
    "method: 'PATCH'",
    "method: 'PUT'",
    "method: 'DELETE'",
    'createIssue',
    'send_message',
    'submitApplication',
    'submitProposal',
    'purchase',
    'payment',
  ]) {
    assert.equal(sources.includes(prohibited), false, `prohibited collector write reference: ${prohibited}`);
  }
});
