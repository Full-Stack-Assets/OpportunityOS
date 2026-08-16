import {
  createCollectorReceipt,
  hashCanonical,
  matchesDemandQueryFamily,
  type DemandQueryFamily,
} from '@opportunityos/core';
import {
  createCollectorRunFailure,
  type AttributedPublicDemandObservation,
  type CollectorFetch,
  type CollectorRejectedRecord,
  type CollectorRunResult,
} from './contracts.ts';

const COLLECTOR_ID = 'hacker-news';
const COLLECTOR_VERSION = '1.0.0';
const DEFAULT_API_BASE = 'https://hacker-news.firebaseio.com';
const DEFAULT_STORY_LIMIT = 50;
const DEFAULT_COMMENTS_PER_STORY = 0;
const DEFAULT_TIMEOUT_MS = 10_000;

type HackerNewsStorySource = 'ask' | 'jobs';

export interface HackerNewsCollectorInput {
  family: DemandQueryFamily;
  storySources: HackerNewsStorySource[];
  storyLimit?: number;
  commentsPerStory?: number;
  apiBase?: string;
  timeoutMs?: number;
  fetchFn?: CollectorFetch;
  now?: () => string;
  previousReceiptHash?: string;
}

interface ParsedStory {
  id: number;
  type: 'story';
  by: string;
  time: number;
  title: string;
  text: string;
  kids: number[];
}

interface ParsedComment {
  id: number;
  type: 'comment';
  by: string;
  time: number;
  parent: number;
  text: string;
}

type ParsedItem = ParsedStory | ParsedComment;

interface ItemFetchResult {
  status: 'ok' | 'unavailable' | 'invalid_json';
  value?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertIntegerRange(value: number, minimum: number, maximum: number, field: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
}

function assertTimeout(value: number): void {
  if (!Number.isInteger(value) || value < 100 || value > 60_000) {
    throw new TypeError('timeoutMs must be an integer between 100 and 60000');
  }
}

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validateStorySources(value: HackerNewsStorySource[]): HackerNewsStorySource[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new TypeError('storySources must contain one or two sources');
  }
  for (const source of value) {
    if (source !== 'ask' && source !== 'jobs') throw new TypeError('storySources may contain only ask or jobs');
  }
  if (new Set(value).size !== value.length) throw new TypeError('storySources must not contain duplicates');
  return [...value];
}

function validateIdList(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((item) => Number.isSafeInteger(item) && (item as number) > 0);
}

function parseKids(value: unknown): number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => Number.isSafeInteger(item) && (item as number) > 0)) return null;
  return value as number[];
}

function parseItem(value: unknown): ParsedItem | null {
  if (!isRecord(value)) return null;
  if (!Number.isSafeInteger(value.id) || (value.id as number) <= 0) return null;
  if (value.type !== 'story' && value.type !== 'comment') return null;
  if (typeof value.by !== 'string' || value.by.trim() === '') return null;
  if (!Number.isSafeInteger(value.time) || (value.time as number) <= 0) return null;

  if (value.type === 'story') {
    if (typeof value.title !== 'string' || value.title.trim() === '') return null;
    if (value.text !== undefined && typeof value.text !== 'string') return null;
    const kids = parseKids(value.kids);
    if (kids === null) return null;
    return {
      id: value.id as number,
      type: 'story',
      by: value.by.trim(),
      time: value.time as number,
      title: value.title.trim(),
      text: typeof value.text === 'string' ? value.text : '',
      kids,
    };
  }

  if (!Number.isSafeInteger(value.parent) || (value.parent as number) <= 0) return null;
  if (typeof value.text !== 'string' || value.text.trim() === '') return null;
  return {
    id: value.id as number,
    type: 'comment',
    by: value.by.trim(),
    time: value.time as number,
    parent: value.parent as number,
    text: value.text,
  };
}

function simplifyHtmlForMatching(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemObservedAt(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function listPath(source: HackerNewsStorySource): string {
  return source === 'ask' ? '/v0/askstories.json' : '/v0/jobstories.json';
}

function canonicalItemUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

function createStoryObservation(
  item: ParsedStory,
  storySource: HackerNewsStorySource,
  family: DemandQueryFamily,
  retrievedAt: string,
): AttributedPublicDemandObservation {
  return {
    provider: 'hacker_news',
    sourceType: 'hacker_news_item',
    externalId: String(item.id),
    canonicalUrl: canonicalItemUrl(item.id),
    title: item.title,
    body: item.text,
    authorId: item.by,
    observedAt: itemObservedAt(item.time),
    retrievedAt,
    retrievalMethod: 'official_api',
    verified: true,
    verificationEvidenceRefs: [`hacker-news-api:${item.id}`],
    queryFamilyId: family.id,
    queryVersion: family.version,
    sourceMetadata: {
      itemType: 'story',
      storySource,
      itemId: item.id,
      unixTime: item.time,
      childCount: item.kids.length,
    },
  };
}

function createCommentObservation(
  item: ParsedComment,
  storySource: HackerNewsStorySource,
  storyId: number,
  family: DemandQueryFamily,
  retrievedAt: string,
): AttributedPublicDemandObservation {
  return {
    provider: 'hacker_news',
    sourceType: 'hacker_news_item',
    externalId: String(item.id),
    canonicalUrl: canonicalItemUrl(item.id),
    title: `Hacker News comment ${item.id}`,
    body: item.text,
    authorId: item.by,
    observedAt: itemObservedAt(item.time),
    retrievedAt,
    retrievalMethod: 'official_api',
    verified: true,
    verificationEvidenceRefs: [`hacker-news-api:${item.id}`],
    queryFamilyId: family.id,
    queryVersion: family.version,
    sourceMetadata: {
      itemType: 'comment',
      storySource,
      itemId: item.id,
      parentId: item.parent,
      storyId,
      unixTime: item.time,
    },
  };
}

async function fetchItem(
  id: number,
  apiBase: string,
  fetchFn: CollectorFetch,
  timeoutMs: number,
): Promise<ItemFetchResult> {
  const url = new URL(`/v0/item/${id}.json`, apiBase);
  let response: Response;
  try {
    response = await fetchFn(url, {method: 'GET', signal: AbortSignal.timeout(timeoutMs)});
  } catch {
    return {status: 'unavailable'};
  }
  if (!response.ok) return {status: 'unavailable'};
  try {
    return {status: 'ok', value: await response.json()};
  } catch {
    return {status: 'invalid_json'};
  }
}

function listFailureState(status: number): 'RATE_LIMITED' | 'UNAVAILABLE' {
  return status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE';
}

export async function collectHackerNews(input: HackerNewsCollectorInput): Promise<CollectorRunResult> {
  const storySources = validateStorySources(input.storySources);
  const storyLimit = input.storyLimit ?? DEFAULT_STORY_LIMIT;
  const commentsPerStory = input.commentsPerStory ?? DEFAULT_COMMENTS_PER_STORY;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertIntegerRange(storyLimit, 1, 200, 'storyLimit');
  assertIntegerRange(commentsPerStory, 0, 20, 'commentsPerStory');
  assertTimeout(timeoutMs);

  const now = input.now ?? (() => new Date().toISOString());
  if (!input.family.compatibleProviders.includes('hacker_news')) {
    const checkedAt = now();
    return createCollectorRunFailure({
      provider: 'hacker_news',
      state: 'POLICY_BLOCKED',
      checkedAt,
      detail: 'Demand query family is not approved for Hacker News.',
      familyId: input.family.id,
      queryVersion: input.family.version,
      collectorId: COLLECTOR_ID,
      collectorVersion: COLLECTOR_VERSION,
      credentialMode: 'not_applicable',
      previousReceiptHash: input.previousReceiptHash,
      requestContext: {storySources, storyLimit, commentsPerStory},
    });
  }

  const apiBase = input.apiBase ?? DEFAULT_API_BASE;
  const fetchFn = input.fetchFn ?? fetch;
  const startedAt = now();
  if (!isIsoTimestamp(startedAt)) throw new TypeError('now() must return an ISO-8601 timestamp');
  const requestFingerprint = hashCanonical({
    provider: 'hacker_news',
    queryFamilyId: input.family.id,
    queryVersion: input.family.version,
    storySources,
    storyLimit,
    commentsPerStory,
    apiBase,
  });

  const rejected: CollectorRejectedRecord[] = [];
  const verifiedObservations: AttributedPublicDemandObservation[] = [];
  const paginationParts: string[] = [];
  let recordsObserved = 0;
  let recordsVerified = 0;

  for (const storySource of storySources) {
    const listUrl = new URL(listPath(storySource), apiBase);
    let listResponse: Response;
    try {
      listResponse = await fetchFn(listUrl, {method: 'GET', signal: AbortSignal.timeout(timeoutMs)});
    } catch {
      const checkedAt = now();
      return createCollectorRunFailure({
        provider: 'hacker_news',
        state: 'UNAVAILABLE',
        checkedAt,
        detail: 'Hacker News story list was unavailable.',
        familyId: input.family.id,
        queryVersion: input.family.version,
        collectorId: COLLECTOR_ID,
        collectorVersion: COLLECTOR_VERSION,
        credentialMode: 'not_applicable',
        previousReceiptHash: input.previousReceiptHash,
        requestContext: {requestFingerprint, storySource},
      });
    }

    if (!listResponse.ok) {
      const checkedAt = now();
      return createCollectorRunFailure({
        provider: 'hacker_news',
        state: listFailureState(listResponse.status),
        checkedAt,
        detail: `Hacker News story list request failed with status ${listResponse.status}.`,
        familyId: input.family.id,
        queryVersion: input.family.version,
        collectorId: COLLECTOR_ID,
        collectorVersion: COLLECTOR_VERSION,
        credentialMode: 'not_applicable',
        previousReceiptHash: input.previousReceiptHash,
        requestContext: {requestFingerprint, storySource, status: listResponse.status},
      });
    }

    let idsPayload: unknown;
    try {
      idsPayload = await listResponse.json();
    } catch {
      const checkedAt = now();
      return createCollectorRunFailure({
        provider: 'hacker_news',
        state: 'SCHEMA_DRIFT',
        checkedAt,
        detail: 'Hacker News story list was not valid JSON.',
        familyId: input.family.id,
        queryVersion: input.family.version,
        collectorId: COLLECTOR_ID,
        collectorVersion: COLLECTOR_VERSION,
        credentialMode: 'not_applicable',
        previousReceiptHash: input.previousReceiptHash,
        requestContext: {requestFingerprint, storySource},
      });
    }
    if (!validateIdList(idsPayload)) {
      const checkedAt = now();
      return createCollectorRunFailure({
        provider: 'hacker_news',
        state: 'SCHEMA_DRIFT',
        checkedAt,
        detail: 'Hacker News story list schema was not recognized.',
        familyId: input.family.id,
        queryVersion: input.family.version,
        collectorId: COLLECTOR_ID,
        collectorVersion: COLLECTOR_VERSION,
        credentialMode: 'not_applicable',
        previousReceiptHash: input.previousReceiptHash,
        requestContext: {requestFingerprint, storySource},
      });
    }

    const selectedIds = idsPayload.slice(0, storyLimit);
    paginationParts.push(`${storySource}:${selectedIds.length}`);

    for (const storyId of selectedIds) {
      recordsObserved += 1;
      const storyFetch = await fetchItem(storyId, apiBase, fetchFn, timeoutMs);
      if (storyFetch.status !== 'ok') {
        rejected.push({sourceId: String(storyId), reason: storyFetch.status === 'invalid_json' ? 'INVALID_ITEM_SCHEMA' : 'ITEM_UNAVAILABLE'});
        continue;
      }
      if (isRecord(storyFetch.value) && storyFetch.value.dead === true) {
        rejected.push({sourceId: String(storyId), reason: 'ITEM_DEAD'});
        continue;
      }
      if (isRecord(storyFetch.value) && storyFetch.value.deleted === true) {
        rejected.push({sourceId: String(storyId), reason: 'ITEM_DELETED'});
        continue;
      }
      const parsedStory = parseItem(storyFetch.value);
      if (!parsedStory || parsedStory.type !== 'story') {
        rejected.push({sourceId: String(storyId), reason: 'INVALID_ITEM_SCHEMA'});
        continue;
      }

      const retrievedAt = now();
      const storyMatches = matchesDemandQueryFamily(
        `${parsedStory.title}\n${simplifyHtmlForMatching(parsedStory.text)}`,
        input.family,
      );
      if (storyMatches) {
        verifiedObservations.push(createStoryObservation(parsedStory, storySource, input.family, retrievedAt));
        recordsVerified += 1;
      } else {
        rejected.push({sourceId: String(parsedStory.id), reason: 'QUERY_FAMILY_NO_MATCH'});
      }

      if (commentsPerStory === 0 || parsedStory.kids.length === 0) continue;
      for (const commentId of parsedStory.kids.slice(0, commentsPerStory)) {
        recordsObserved += 1;
        const commentFetch = await fetchItem(commentId, apiBase, fetchFn, timeoutMs);
        if (commentFetch.status !== 'ok') {
          rejected.push({sourceId: String(commentId), reason: commentFetch.status === 'invalid_json' ? 'INVALID_ITEM_SCHEMA' : 'ITEM_UNAVAILABLE'});
          continue;
        }
        if (isRecord(commentFetch.value) && commentFetch.value.dead === true) {
          rejected.push({sourceId: String(commentId), reason: 'ITEM_DEAD'});
          continue;
        }
        if (isRecord(commentFetch.value) && commentFetch.value.deleted === true) {
          rejected.push({sourceId: String(commentId), reason: 'ITEM_DELETED'});
          continue;
        }
        const parsedComment = parseItem(commentFetch.value);
        if (!parsedComment || parsedComment.type !== 'comment') {
          rejected.push({sourceId: String(commentId), reason: 'INVALID_ITEM_SCHEMA'});
          continue;
        }
        if (!matchesDemandQueryFamily(simplifyHtmlForMatching(parsedComment.text), input.family)) {
          rejected.push({sourceId: String(parsedComment.id), reason: 'QUERY_FAMILY_NO_MATCH'});
          continue;
        }
        verifiedObservations.push(createCommentObservation(parsedComment, storySource, parsedStory.id, input.family, now()));
        recordsVerified += 1;
      }
    }
  }

  const byExternalId = new Map<string, AttributedPublicDemandObservation>();
  let recordsDeduplicated = 0;
  for (const observation of verifiedObservations) {
    if (byExternalId.has(observation.externalId)) recordsDeduplicated += 1;
    else byExternalId.set(observation.externalId, observation);
  }
  const observations = [...byExternalId.values()].sort((left, right) => Number(left.externalId) - Number(right.externalId));
  const completedAt = now();
  if (!isIsoTimestamp(completedAt)) throw new TypeError('now() must return an ISO-8601 timestamp');
  const healthState = rejected.length > 0 ? 'DEGRADED' : 'HEALTHY';
  const resultFingerprint = hashCanonical({
    observations,
    rejected,
    recordsObserved,
    recordsVerified,
    recordsDeduplicated,
  });
  const receipt = createCollectorReceipt({
    collectorId: COLLECTOR_ID,
    collectorVersion: COLLECTOR_VERSION,
    provider: 'hacker_news',
    queryFamilyId: input.family.id,
    queryVersion: input.family.version,
    startedAt,
    completedAt,
    retrievalMethod: 'official_api',
    credentialMode: 'not_applicable',
    healthBefore: 'HEALTHY',
    healthAfter: healthState,
    recordsObserved,
    recordsVerified,
    recordsRejected: rejected.length,
    recordsDeduplicated,
    signalsEmitted: observations.length,
    requestFingerprint,
    resultFingerprint,
    paginationState: paginationParts.join(','),
    failureCode: null,
    failureDetails: null,
    ...(input.previousReceiptHash === undefined ? {} : {previousReceiptHash: input.previousReceiptHash}),
  });

  return {
    observations,
    receipt,
    health: {
      provider: 'hacker_news',
      state: healthState,
      checkedAt: completedAt,
      detail: rejected.length > 0 ? `${rejected.length} source records were rejected.` : null,
    },
    rejected,
  };
}
