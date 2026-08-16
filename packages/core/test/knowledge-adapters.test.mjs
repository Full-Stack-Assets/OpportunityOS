import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ingestConversation,
  ingestDriveFile,
  ingestGmailMessage,
  ingestWisebaseItem,
  scoreGmailKnowledgeRelevance,
} from '../src/index.ts';

test('Drive adapter preserves native file identity and separates retrieval text from metadata', () => {
  const result = ingestDriveFile({
    id: 'drive-1',
    name: 'OpportunityOS Architecture',
    mimeType: 'application/vnd.google-apps.document',
    modifiedTime: '2026-08-16T14:00:00.000Z',
    url: 'https://drive.google.com/file/d/drive-1',
    text: 'BuildGraph preflight architecture',
    projectHints: ['OpportunityOS'],
    metadata: {
      owners: ['owner@example.com'],
      rawBinary: 'must-not-persist',
      access_token: 'must-not-persist',
      Authorization: 'Bearer must-not-persist',
      nested: { apiKey: 'must-not-persist', safeField: 'safe' },
    },
  });
  assert.equal(result.source.system, 'google-drive');
  assert.equal(result.source.sourceNativeId, 'drive-1');
  assert.ok(result.source.contentHash);
  assert.equal(result.retrievalText, 'BuildGraph preflight architecture');
  assert.equal(Object.hasOwn(result.source.metadata, 'rawBinary'), false);
  assert.equal(Object.hasOwn(result.source.metadata, 'access_token'), false);
  assert.equal(Object.hasOwn(result.source.metadata, 'Authorization'), false);
  assert.deepEqual(result.source.metadata.nested, { safeField: 'safe' });
  assert.equal(JSON.stringify(result.source.metadata).includes('BuildGraph preflight architecture'), false);
  assert.equal(result.entity.kind, 'document');
});

test('conversation adapter preserves conversation identity, ordering, and retrieval text', () => {
  const result = ingestConversation({
    id: 'chat-1',
    title: 'BuildGraph planning',
    observedAt: '2026-08-16T14:00:00.000Z',
    messages: [
      { id: 'm1', role: 'user', text: 'Build a persistent registry', observedAt: '2026-08-16T14:00:00.000Z' },
      { id: 'm2', role: 'assistant', text: 'Use Postgres', observedAt: '2026-08-16T14:01:00.000Z' },
    ],
    projectHints: ['BuildGraph'],
  });
  assert.equal(result.source.system, 'chat-history');
  assert.equal(result.entity.kind, 'conversation');
  assert.deepEqual(result.children.map((item) => item.metadata?.order), [0, 1]);
  assert.equal(result.retrievalText, 'Build a persistent registry\nUse Postgres');
});

test('Gmail relevance includes project/client work and excludes automated promotions', () => {
  const relevant = scoreGmailKnowledgeRelevance({
    subject: 'OpportunityOS client proposal',
    body: 'Please review the contract and deployment plan for OpportunityOS.',
    labels: ['INBOX'],
    projectAliases: ['OpportunityOS'],
  });
  const promo = scoreGmailKnowledgeRelevance({
    subject: 'Weekly product newsletter',
    body: 'Promotional offer and receipt roundup',
    labels: ['CATEGORY_PROMOTIONS'],
    projectAliases: [],
  });
  assert.equal(relevant.persist, true);
  assert.ok(relevant.score >= 0.5);
  assert.equal(promo.persist, false);
});

test('Gmail adapter keeps relevant message retrieval text outside canonical metadata', () => {
  const result = ingestGmailMessage({
    id: 'mail-relevant',
    threadId: 'thread-relevant',
    subject: 'OpportunityOS client proposal',
    body: 'Please review the contract and deployment plan for OpportunityOS.',
    observedAt: '2026-08-16T14:00:00.000Z',
    labels: ['INBOX'],
    projectAliases: ['OpportunityOS'],
  });
  assert.equal(result.persist, true);
  assert.ok(result.source);
  assert.equal(result.retrievalText, 'OpportunityOS client proposal\nPlease review the contract and deployment plan for OpportunityOS.');
  assert.equal(JSON.stringify(result.source?.metadata).includes('Please review the contract'), false);
});

test('Gmail adapter refuses to persist a low-relevance message as canonical knowledge', () => {
  const result = ingestGmailMessage({
    id: 'mail-1',
    threadId: 'thread-1',
    subject: 'Newsletter',
    body: 'Generic promotional newsletter',
    observedAt: '2026-08-16T14:00:00.000Z',
    labels: ['CATEGORY_PROMOTIONS'],
    projectAliases: [],
  });
  assert.equal(result.persist, false);
  assert.equal(result.source, undefined);
  assert.equal(result.retrievalText, undefined);
});

test('Wisebase adapter preserves native item identity, scrubs secrets, and separates retrieval text', () => {
  const result = ingestWisebaseItem({
    id: 'wise-1',
    title: 'BuildGraph Decisions',
    observedAt: '2026-08-16T14:00:00.000Z',
    text: 'Persistent registry is canonical.',
    projectHints: ['BuildGraph'],
    metadata: { collection: 'architecture', refreshToken: 'must-not-persist' },
  });
  assert.equal(result.source.system, 'wisebase');
  assert.equal(result.source.sourceNativeId, 'wise-1');
  assert.equal(result.entity.kind, 'document');
  assert.equal(result.source.metadata.collection, 'architecture');
  assert.equal(Object.hasOwn(result.source.metadata, 'refreshToken'), false);
  assert.equal(result.retrievalText, 'Persistent registry is canonical.');
});
