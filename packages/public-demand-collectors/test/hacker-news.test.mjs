import test from 'node:test';
import assert from 'node:assert/strict';
import {getDemandQueryFamily} from '@opportunityos/core';
import {collectHackerNews} from '../src/hacker-news.ts';

const NOW = '2026-08-16T17:10:00Z';

function story(overrides = {}) {
  return {
    id: 1001,
    type: 'story',
    by: 'founder',
    time: 1786903200,
    title: 'Ask HN: Looking for someone to build an internal automation',
    text: 'Paid project. We need an AI workflow integration.',
    kids: [2001],
    ...overrides,
  };
}

function comment(overrides = {}) {
  return {
    id: 2001,
    type: 'comment',
    by: 'buyer',
    time: 1786903300,
    parent: 1001,
    text: 'Looking for a developer for a paid automation project.',
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
}

function input(overrides = {}) {
  return {
    family: getDemandQueryFamily('AI_AUTOMATION_REQUEST'),
    storySources: ['ask'],
    storyLimit: 10,
    commentsPerStory: 0,
    now: () => NOW,
    fetchFn: async (url) => {
      const value = String(url);
      if (value.endsWith('/v0/askstories.json')) return jsonResponse([1001]);
      if (value.endsWith('/v0/item/1001.json')) return jsonResponse(story());
      throw new Error(`unexpected url ${value}`);
    },
    ...overrides,
  };
}

test('Hacker News official API collector emits a verified Ask HN observation', async () => {
  const calls = [];
  const result = await collectHackerNews(input({
    fetchFn: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.endsWith('/v0/askstories.json')) return jsonResponse([1001]);
      if (value.endsWith('/v0/item/1001.json')) return jsonResponse(story());
      throw new Error(`unexpected url ${value}`);
    },
  }));

  assert.equal(result.health.state, 'HEALTHY');
  assert.equal(result.observations.length, 1);
  const observation = result.observations[0];
  assert.equal(observation.provider, 'hacker_news');
  assert.equal(observation.sourceType, 'hacker_news_item');
  assert.equal(observation.externalId, '1001');
  assert.equal(observation.canonicalUrl, 'https://news.ycombinator.com/item?id=1001');
  assert.equal(observation.authorId, 'founder');
  assert.equal(observation.retrievalMethod, 'official_api');
  assert.equal(observation.verified, true);
  assert.equal(observation.queryFamilyId, 'AI_AUTOMATION_REQUEST');
  assert.equal(observation.queryVersion, '1.0.0');
  assert.equal(observation.sourceMetadata.itemType, 'story');
  assert.equal(observation.sourceMetadata.storySource, 'ask');
  assert.deepEqual(observation.verificationEvidenceRefs, ['hacker-news-api:1001']);
  assert.equal(result.receipt.recordsObserved, 1);
  assert.equal(result.receipt.recordsVerified, 1);
  assert.equal(result.receipt.signalsEmitted, 1);
  assert.deepEqual(calls, [
    'https://hacker-news.firebaseio.com/v0/askstories.json',
    'https://hacker-news.firebaseio.com/v0/item/1001.json',
  ]);
});

test('Hacker News direct-comment retrieval is bounded by commentsPerStory', async () => {
  const calls = [];
  const result = await collectHackerNews(input({
    family: getDemandQueryFamily('EXPLICIT_DEVELOPER_HIRE'),
    commentsPerStory: 1,
    fetchFn: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.endsWith('/v0/askstories.json')) return jsonResponse([1001]);
      if (value.endsWith('/v0/item/1001.json')) {
        return jsonResponse(story({
          title: 'Ask HN: What operational problems are founders facing?',
          text: 'Share current blockers.',
          kids: [2001, 2002, 2003],
        }));
      }
      if (value.endsWith('/v0/item/2001.json')) return jsonResponse(comment());
      if (value.includes('/v0/item/2002.json') || value.includes('/v0/item/2003.json')) {
        throw new Error('comment bound violated');
      }
      throw new Error(`unexpected url ${value}`);
    },
  }));

  assert.equal(calls.filter((value) => /\/v0\/item\/2\d+\.json$/.test(value)).length, 1);
  assert.equal(result.observations.filter((item) => item.sourceMetadata.itemType === 'comment').length, 1);
  assert.equal(result.observations.some((item) => item.externalId === '2001'), true);
});

test('Hacker News dead, deleted, malformed, and non-matching records are rejected locally', async () => {
  const result = await collectHackerNews(input({
    storyLimit: 4,
    fetchFn: async (url) => {
      const value = String(url);
      if (value.endsWith('/v0/askstories.json')) return jsonResponse([1001, 1002, 1003, 1004]);
      if (value.endsWith('/v0/item/1001.json')) return jsonResponse(story({dead: true}));
      if (value.endsWith('/v0/item/1002.json')) return jsonResponse(story({id: 1002, deleted: true}));
      if (value.endsWith('/v0/item/1003.json')) return jsonResponse({id: 1003, type: 'story'});
      if (value.endsWith('/v0/item/1004.json')) return jsonResponse(story({id: 1004, title: 'Show HN: routine library update', text: 'A release announcement.'}));
      throw new Error(`unexpected url ${value}`);
    },
  }));

  assert.deepEqual(result.observations, []);
  assert.equal(result.health.state, 'DEGRADED');
  assert.deepEqual(result.rejected.map((item) => item.reason), [
    'ITEM_DEAD',
    'ITEM_DELETED',
    'INVALID_ITEM_SCHEMA',
    'QUERY_FAMILY_NO_MATCH',
  ]);
  assert.equal(result.receipt.recordsObserved, 4);
  assert.equal(result.receipt.recordsRejected, 4);
});

test('Hacker News list-level upstream and schema failures fail the run closed', async () => {
  const upstream = await collectHackerNews(input({
    fetchFn: async () => new Response('error', {status: 500}),
  }));
  assert.equal(upstream.health.state, 'UNAVAILABLE');
  assert.deepEqual(upstream.observations, []);

  const rateLimited = await collectHackerNews(input({
    fetchFn: async () => new Response('slow down', {status: 429}),
  }));
  assert.equal(rateLimited.health.state, 'RATE_LIMITED');
  assert.deepEqual(rateLimited.observations, []);

  const schema = await collectHackerNews(input({
    fetchFn: async () => jsonResponse({ids: [1001]}),
  }));
  assert.equal(schema.health.state, 'SCHEMA_DRIFT');
  assert.deepEqual(schema.observations, []);

  const network = await collectHackerNews(input({
    fetchFn: async () => { throw new Error('network down'); },
  }));
  assert.equal(network.health.state, 'UNAVAILABLE');
  assert.deepEqual(network.observations, []);
});

test('Hacker News item retrieval failure degrades coverage without fabricating the item', async () => {
  const result = await collectHackerNews(input({
    fetchFn: async (url) => {
      const value = String(url);
      if (value.endsWith('/v0/askstories.json')) return jsonResponse([1001]);
      if (value.endsWith('/v0/item/1001.json')) return new Response('missing', {status: 503});
      throw new Error(`unexpected url ${value}`);
    },
  }));
  assert.equal(result.health.state, 'DEGRADED');
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.rejected, [{sourceId: '1001', reason: 'ITEM_UNAVAILABLE'}]);
});

test('Hacker News local query filtering is deterministic and does not claim provider-native search', async () => {
  const result = await collectHackerNews(input({
    fetchFn: async (url) => {
      const value = String(url);
      if (value.endsWith('/v0/askstories.json')) return jsonResponse([1001]);
      if (value.endsWith('/v0/item/1001.json')) return jsonResponse(story({title: 'Ask HN: favorite databases?', text: 'General discussion.'}));
      throw new Error(`unexpected url ${value}`);
    },
  }));
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.rejected, [{sourceId: '1001', reason: 'QUERY_FAMILY_NO_MATCH'}]);
  assert.equal(result.receipt.retrievalMethod, 'official_api');
  assert.deepEqual(result.receipt.paginationState, 'ask:1');
});

test('Hacker News collector validates bounded story and comment limits before network access', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return jsonResponse([]); };
  await assert.rejects(() => collectHackerNews(input({storyLimit: 0, fetchFn})), /storyLimit/);
  await assert.rejects(() => collectHackerNews(input({storyLimit: 201, fetchFn})), /storyLimit/);
  await assert.rejects(() => collectHackerNews(input({commentsPerStory: -1, fetchFn})), /commentsPerStory/);
  await assert.rejects(() => collectHackerNews(input({commentsPerStory: 21, fetchFn})), /commentsPerStory/);
  assert.equal(calls, 0);
});
