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

const COLLECTOR_ID = 'github-issues';
const COLLECTOR_VERSION = '1.0.0';
const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_API_VERSION = '2026-03-10';
const DEFAULT_LIMIT = 25;
const DEFAULT_PAGE_LIMIT = 1;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GitHubIssuesCollectorInput {
  family: DemandQueryFamily;
  limit?: number;
  pageLimit?: number;
  token?: string;
  apiBase?: string;
  apiVersion?: string;
  timeoutMs?: number;
  fetchFn?: CollectorFetch;
  now?: () => string;
  previousReceiptHash?: string;
}

interface GitHubSearchResponse {
  total_count: number;
  items: unknown[];
}

interface ParsedGitHubIssue {
  id: number;
  number: number;
  state: 'open';
  title: string;
  body: string;
  htmlUrl: string;
  repository: string;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
  labels: string[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function parseRepository(repositoryUrl: unknown): string | null {
  if (typeof repositoryUrl !== 'string' || repositoryUrl.trim() === '') return null;
  try {
    const parsed = new URL(repositoryUrl);
    const match = parsed.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/?$/);
    if (!match) return null;
    const owner = match[1];
    const repository = match[2];
    if (!owner || !repository) return null;
    return `${owner}/${repository}`;
  } catch {
    return null;
  }
}

function parseLabels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const labels: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) return null;
      labels.push(trimmed);
      continue;
    }
    if (isRecord(item) && typeof item.name === 'string' && item.name.trim() !== '') {
      labels.push(item.name.trim());
      continue;
    }
    return null;
  }
  return labels;
}

function parseIssue(value: unknown): ParsedGitHubIssue | null {
  if (!isRecord(value)) return null;
  if (!Number.isSafeInteger(value.id) || (value.id as number) < 0) return null;
  if (!Number.isSafeInteger(value.number) || (value.number as number) < 1) return null;
  if (value.state !== 'open') return null;
  if (typeof value.title !== 'string' || value.title.trim() === '') return null;
  if (value.body !== null && typeof value.body !== 'string') return null;
  if (typeof value.html_url !== 'string' || value.html_url.trim() === '') return null;
  if (!isIsoTimestamp(value.created_at) || !isIsoTimestamp(value.updated_at)) return null;

  const repository = parseRepository(value.repository_url);
  const labels = parseLabels(value.labels);
  if (!repository || labels === null) return null;

  let authorId: string | null = null;
  if (value.user !== null && value.user !== undefined) {
    if (!isRecord(value.user)) return null;
    if (value.user.login !== null && value.user.login !== undefined) {
      if (typeof value.user.login !== 'string' || value.user.login.trim() === '') return null;
      authorId = value.user.login.trim();
    }
  }

  return {
    id: value.id as number,
    number: value.number as number,
    state: 'open',
    title: value.title.trim(),
    body: typeof value.body === 'string' ? value.body : '',
    htmlUrl: value.html_url,
    repository,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    authorId,
    labels,
  };
}

function validateSearchResponse(value: unknown): value is GitHubSearchResponse {
  return isRecord(value)
    && Number.isSafeInteger(value.total_count)
    && (value.total_count as number) >= 0
    && Array.isArray(value.items);
}

function failureState(response: Response): 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'UNAVAILABLE' {
  if (response.status === 401) return 'AUTH_REQUIRED';
  if (response.status === 429) return 'RATE_LIMITED';
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') return 'RATE_LIMITED';
  return 'UNAVAILABLE';
}

function issueSourceId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const repository = parseRepository(value.repository_url);
  const number = Number.isSafeInteger(value.number) ? value.number as number : null;
  return repository && number !== null ? `${repository}#${number}` : null;
}

function createObservation(
  issue: ParsedGitHubIssue,
  family: DemandQueryFamily,
  retrievedAt: string,
): AttributedPublicDemandObservation {
  const externalId = `${issue.repository}#${issue.number}`;
  return {
    provider: 'github_issues',
    sourceType: 'github_issue',
    externalId,
    canonicalUrl: issue.htmlUrl,
    title: issue.title,
    body: issue.body,
    authorId: issue.authorId,
    observedAt: issue.updatedAt,
    retrievedAt,
    retrievalMethod: 'official_api',
    verified: true,
    verificationEvidenceRefs: [`github-api:${externalId}`],
    queryFamilyId: family.id,
    queryVersion: family.version,
    sourceMetadata: {
      repository: issue.repository,
      issueId: issue.id,
      issueNumber: issue.number,
      state: issue.state,
      labels: issue.labels,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    },
  };
}

export async function collectGitHubIssues(input: GitHubIssuesCollectorInput): Promise<CollectorRunResult> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const pageLimit = input.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertIntegerRange(limit, 1, 100, 'limit');
  assertIntegerRange(pageLimit, 1, 10, 'pageLimit');
  assertTimeout(timeoutMs);

  if (!input.family.compatibleProviders.includes('github_issues')) {
    const checkedAt = (input.now ?? (() => new Date().toISOString()))();
    return createCollectorRunFailure({
      provider: 'github_issues',
      state: 'POLICY_BLOCKED',
      checkedAt,
      detail: 'Demand query family is not approved for GitHub Issues.',
      familyId: input.family.id,
      queryVersion: input.family.version,
      collectorId: COLLECTOR_ID,
      collectorVersion: COLLECTOR_VERSION,
      credentialMode: input.token ? 'authenticated' : 'anonymous_public',
      previousReceiptHash: input.previousReceiptHash,
      requestContext: {limit, pageLimit},
    });
  }

  const providerQueries = input.family.providerQueries.github_issues ?? [];
  if (providerQueries.length === 0) {
    const checkedAt = (input.now ?? (() => new Date().toISOString()))();
    return createCollectorRunFailure({
      provider: 'github_issues',
      state: 'POLICY_BLOCKED',
      checkedAt,
      detail: 'Demand query family has no approved GitHub Issues query.',
      familyId: input.family.id,
      queryVersion: input.family.version,
      collectorId: COLLECTOR_ID,
      collectorVersion: COLLECTOR_VERSION,
      credentialMode: input.token ? 'authenticated' : 'anonymous_public',
      previousReceiptHash: input.previousReceiptHash,
      requestContext: {limit, pageLimit},
    });
  }

  const apiBase = input.apiBase ?? DEFAULT_API_BASE;
  const apiVersion = input.apiVersion ?? DEFAULT_API_VERSION;
  const fetchFn = input.fetchFn ?? fetch;
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  if (!isIsoTimestamp(startedAt)) throw new TypeError('now() must return an ISO-8601 timestamp');

  const requestFingerprint = hashCanonical({
    provider: 'github_issues',
    queryFamilyId: input.family.id,
    queryVersion: input.family.version,
    providerQueries,
    limit,
    pageLimit,
    apiBase,
    apiVersion,
    credentialMode: input.token ? 'authenticated' : 'anonymous_public',
  });

  const rejected: CollectorRejectedRecord[] = [];
  const verifiedObservations: AttributedPublicDemandObservation[] = [];
  let recordsObserved = 0;
  let recordsVerified = 0;
  let pagesFetched = 0;

  for (const providerQuery of providerQueries) {
    for (let page = 1; page <= pageLimit; page += 1) {
      const url = new URL('/search/issues', apiBase);
      url.searchParams.set('q', `${providerQuery} is:issue state:open`);
      url.searchParams.set('sort', 'created');
      url.searchParams.set('order', 'desc');
      url.searchParams.set('per_page', String(limit));
      url.searchParams.set('page', String(page));

      const headers = new Headers({
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': apiVersion,
        'User-Agent': 'OpportunityOS-PublicDemandCollector/1.0',
      });
      if (input.token) headers.set('Authorization', `Bearer ${input.token}`);

      let response: Response;
      try {
        response = await fetchFn(url, {method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs)});
      } catch {
        const checkedAt = now();
        return createCollectorRunFailure({
          provider: 'github_issues',
          state: 'UNAVAILABLE',
          checkedAt,
          detail: 'GitHub Issues request was unavailable.',
          familyId: input.family.id,
          queryVersion: input.family.version,
          collectorId: COLLECTOR_ID,
          collectorVersion: COLLECTOR_VERSION,
          credentialMode: input.token ? 'authenticated' : 'anonymous_public',
          previousReceiptHash: input.previousReceiptHash,
          requestContext: {requestFingerprint},
        });
      }

      if (!response.ok) {
        const state = failureState(response);
        const checkedAt = now();
        return createCollectorRunFailure({
          provider: 'github_issues',
          state,
          checkedAt,
          detail: `GitHub Issues request failed with status ${response.status}.`,
          familyId: input.family.id,
          queryVersion: input.family.version,
          collectorId: COLLECTOR_ID,
          collectorVersion: COLLECTOR_VERSION,
          credentialMode: input.token ? 'authenticated' : 'anonymous_public',
          previousReceiptHash: input.previousReceiptHash,
          requestContext: {requestFingerprint, status: response.status},
        });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        const checkedAt = now();
        return createCollectorRunFailure({
          provider: 'github_issues',
          state: 'SCHEMA_DRIFT',
          checkedAt,
          detail: 'GitHub Issues response was not valid JSON.',
          familyId: input.family.id,
          queryVersion: input.family.version,
          collectorId: COLLECTOR_ID,
          collectorVersion: COLLECTOR_VERSION,
          credentialMode: input.token ? 'authenticated' : 'anonymous_public',
          previousReceiptHash: input.previousReceiptHash,
          requestContext: {requestFingerprint},
        });
      }
      if (!validateSearchResponse(payload)) {
        const checkedAt = now();
        return createCollectorRunFailure({
          provider: 'github_issues',
          state: 'SCHEMA_DRIFT',
          checkedAt,
          detail: 'GitHub Issues response schema was not recognized.',
          familyId: input.family.id,
          queryVersion: input.family.version,
          collectorId: COLLECTOR_ID,
          collectorVersion: COLLECTOR_VERSION,
          credentialMode: input.token ? 'authenticated' : 'anonymous_public',
          previousReceiptHash: input.previousReceiptHash,
          requestContext: {requestFingerprint},
        });
      }

      pagesFetched += 1;
      recordsObserved += payload.items.length;
      const retrievedAt = now();
      for (const item of payload.items) {
        const sourceId = issueSourceId(item);
        if (isRecord(item) && Object.hasOwn(item, 'pull_request')) {
          rejected.push({sourceId, reason: 'PULL_REQUEST_NOT_ISSUE'});
          continue;
        }
        if (isRecord(item) && item.state !== 'open') {
          rejected.push({sourceId, reason: 'ISSUE_NOT_OPEN'});
          continue;
        }
        const parsed = parseIssue(item);
        if (!parsed) {
          rejected.push({sourceId, reason: 'INVALID_ISSUE_SCHEMA'});
          continue;
        }
        if (!matchesDemandQueryFamily(`${parsed.title}\n${parsed.body}`, input.family)) {
          rejected.push({sourceId: `${parsed.repository}#${parsed.number}`, reason: 'QUERY_FAMILY_NO_MATCH'});
          continue;
        }
        verifiedObservations.push(createObservation(parsed, input.family, retrievedAt));
        recordsVerified += 1;
      }

      if (payload.items.length < limit) break;
    }
  }

  const byExternalId = new Map<string, AttributedPublicDemandObservation>();
  let recordsDeduplicated = 0;
  for (const observation of verifiedObservations) {
    if (byExternalId.has(observation.externalId)) recordsDeduplicated += 1;
    else byExternalId.set(observation.externalId, observation);
  }
  const observations = [...byExternalId.values()].sort((left, right) => left.externalId.localeCompare(right.externalId));
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
    provider: 'github_issues',
    queryFamilyId: input.family.id,
    queryVersion: input.family.version,
    startedAt,
    completedAt,
    retrievalMethod: 'official_api',
    credentialMode: input.token ? 'authenticated' : 'anonymous_public',
    healthBefore: 'HEALTHY',
    healthAfter: healthState,
    recordsObserved,
    recordsVerified,
    recordsRejected: rejected.length,
    recordsDeduplicated,
    signalsEmitted: observations.length,
    requestFingerprint,
    resultFingerprint,
    paginationState: `pages:${pagesFetched}`,
    failureCode: null,
    failureDetails: null,
    ...(input.previousReceiptHash === undefined ? {} : {previousReceiptHash: input.previousReceiptHash}),
  });

  return {
    observations,
    receipt,
    health: {
      provider: 'github_issues',
      state: healthState,
      checkedAt: completedAt,
      detail: rejected.length > 0 ? `${rejected.length} source records were rejected.` : null,
    },
    rejected,
  };
}
