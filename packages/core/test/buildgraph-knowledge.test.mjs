import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyKnowledgeDisposition,
  createCanonicalEntity,
  createSourceRecord,
  ingestGitHubRepository,
  normalizeEntityName,
  resolveKnowledgeItem,
} from '../src/index.ts';

test('normalizes repository-style aliases into a stable entity key', () => {
  assert.equal(normalizeEntityName(' VaporLoop '), 'vaporloop');
  assert.equal(normalizeEntityName('vapor-loop'), 'vaporloop');
  assert.equal(normalizeEntityName('-MoviesRule.com'), 'moviesrule');
  assert.equal(normalizeEntityName('Nextgengear.cc'), 'nextgengear');
});

test('creates stable canonical entity IDs and provenance hashes', () => {
  const first = createCanonicalEntity({
    kind: 'project',
    canonicalName: 'OpportunityOS',
    aliases: ['Opportunity OS'],
    status: 'active',
    sourceRefs: [],
    tags: ['opportunity-intelligence'],
    createdAt: '2026-08-16T15:00:00.000Z',
    updatedAt: '2026-08-16T15:00:00.000Z',
  });
  const second = createCanonicalEntity({
    kind: 'project',
    canonicalName: 'OpportunityOS',
    aliases: ['Opportunity OS'],
    status: 'active',
    sourceRefs: [],
    tags: ['opportunity-intelligence'],
    createdAt: '2026-08-16T15:00:00.000Z',
    updatedAt: '2026-08-16T15:00:00.000Z',
  });

  assert.equal(first.id, second.id);
  assert.equal(first.provenanceHash, second.provenanceHash);
  assert.match(first.id, /^knowledge:project:/);
});

test('rejects malformed source timestamps instead of inventing chronology', () => {
  assert.throws(
    () => createSourceRecord({
      system: 'github',
      sourceNativeId: '123',
      title: 'Example',
      observedAt: 'not-a-date',
      metadata: {},
    }),
    /observedAt/i,
  );
});

test('exact source identity outranks name similarity and recommends update', () => {
  const entity = createCanonicalEntity({
    kind: 'repository',
    canonicalName: 'VaporLoop',
    aliases: ['vapor-loop'],
    status: 'active',
    sourceRefs: [{ system: 'github', sourceNativeId: '1251357590', url: 'https://github.com/Full-Stack-Assets/VaporLoop' }],
    tags: [],
    createdAt: '2026-08-16T15:00:00.000Z',
    updatedAt: '2026-08-16T15:00:00.000Z',
  });
  const source = createSourceRecord({
    system: 'github',
    sourceNativeId: '1251357590',
    title: 'renamed display value',
    url: 'https://github.com/Full-Stack-Assets/VaporLoop',
    observedAt: '2026-08-16T15:30:00.000Z',
    metadata: {},
  });

  const resolution = resolveKnowledgeItem(source, [entity]);
  assert.equal(resolution.bestMatch?.entityId, entity.id);
  assert.equal(resolution.bestMatch?.score, 1);
  assert.ok(resolution.bestMatch?.reasons.includes('exact-source-identity'));
  assert.equal(classifyKnowledgeDisposition(source, resolution), 'UPDATE');
});

test('unique normalized alias recommends link while ambiguous aliases require review', () => {
  const vapor = createCanonicalEntity({
    kind: 'project', canonicalName: 'VaporLoop', aliases: ['vapor-loop'], status: 'active', sourceRefs: [], tags: [],
    createdAt: '2026-08-16T15:00:00.000Z', updatedAt: '2026-08-16T15:00:00.000Z',
  });
  const source = createSourceRecord({
    system: 'github', sourceNativeId: '1251386571', title: 'vapor-loop', observedAt: '2026-08-16T15:30:00.000Z', metadata: {},
  });

  const unique = resolveKnowledgeItem(source, [vapor]);
  assert.equal(classifyKnowledgeDisposition(source, unique), 'LINK');
  assert.equal(unique.bestMatch?.normalizedNameMatch, true);

  const duplicate = createCanonicalEntity({
    kind: 'project', canonicalName: 'Vapor Loop', aliases: ['vapor-loop'], status: 'active', sourceRefs: [], tags: [],
    createdAt: '2026-08-16T15:00:00.000Z', updatedAt: '2026-08-16T15:00:00.000Z',
  });
  const ambiguous = resolveKnowledgeItem(source, [vapor, duplicate]);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(classifyKnowledgeDisposition(source, ambiguous), 'REVIEW');
});

test('low similarity recommends creating a new entity', () => {
  const existing = createCanonicalEntity({
    kind: 'project', canonicalName: 'HostGraph', aliases: [], status: 'active', sourceRefs: [], tags: [],
    createdAt: '2026-08-16T15:00:00.000Z', updatedAt: '2026-08-16T15:00:00.000Z',
  });
  const source = createSourceRecord({
    system: 'github', sourceNativeId: '999', title: 'Photobeam', observedAt: '2026-08-16T15:30:00.000Z', metadata: {},
  });
  const resolution = resolveKnowledgeItem(source, [existing]);
  assert.equal(classifyKnowledgeDisposition(source, resolution), 'CREATE_ENTITY');
});

test('GitHub ingestion preserves source identity and maps archived lifecycle', () => {
  const ingestion = ingestGitHubRepository({
    id: '1251357590',
    name: 'VaporLoop',
    fullName: 'Full-Stack-Assets/VaporLoop',
    url: 'https://github.com/Full-Stack-Assets/VaporLoop',
    visibility: 'private',
    defaultBranch: 'main',
    size: 28,
    archived: true,
    searchIndexed: true,
    observedAt: '2026-08-16T15:30:00.000Z',
  });

  assert.equal(ingestion.source.system, 'github');
  assert.equal(ingestion.source.sourceNativeId, '1251357590');
  assert.equal(ingestion.repository.status, 'archived');
  assert.equal(ingestion.project.status, 'archived');
  assert.equal(ingestion.repository.metadata?.defaultBranch, 'main');
  assert.equal(ingestion.relationship.type, 'BELONGS_TO');
});

test('GitHub duplicate families normalize to the same project key without destructive merge', () => {
  const pairs = [
    ['VaporLoop', 'vapor-loop'],
    ['moviesrule.com', '-MoviesRule.com'],
    ['nextgengear', 'Nextgengear.cc'],
  ];

  for (const [left, right] of pairs) {
    const a = ingestGitHubRepository({
      id: `left-${left}`, name: left, fullName: `Full-Stack-Assets/${left}`, url: `https://github.com/Full-Stack-Assets/${left}`,
      visibility: 'private', defaultBranch: 'main', size: 1, archived: false, observedAt: '2026-08-16T15:30:00.000Z',
    });
    const b = ingestGitHubRepository({
      id: `right-${right}`, name: right, fullName: `Full-Stack-Assets/${right}`, url: `https://github.com/Full-Stack-Assets/${right}`,
      visibility: 'private', defaultBranch: 'main', size: 1, archived: false, observedAt: '2026-08-16T15:30:00.000Z',
    });

    assert.equal(a.project.normalizedName, b.project.normalizedName);
    const resolution = resolveKnowledgeItem(b.source, [a.project]);
    assert.equal(classifyKnowledgeDisposition(b.source, resolution), 'LINK');
    assert.notEqual(a.source.sourceNativeId, b.source.sourceNativeId);
  }
});