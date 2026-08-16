import { hashCanonical } from './canonical.ts';
import {
  createCanonicalEntity,
  createSourceRecord,
  type CanonicalKnowledgeEntity,
  type KnowledgeSourceRecord,
  type KnowledgeSourceRef,
} from './buildgraph-knowledge.ts';

export interface KnowledgeAdapterResult {
  source: KnowledgeSourceRecord;
  entity: CanonicalKnowledgeEntity;
  children: CanonicalKnowledgeEntity[];
}

export interface DriveKnowledgeInput {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  url?: string;
  text?: string;
  projectHints?: string[];
  metadata?: Record<string, unknown>;
}

export interface ConversationMessageInput {
  id: string;
  role: string;
  text: string;
  observedAt: string;
}

export interface ConversationKnowledgeInput {
  id: string;
  title: string;
  observedAt: string;
  messages: ConversationMessageInput[];
  projectHints?: string[];
  metadata?: Record<string, unknown>;
}

export interface GmailRelevanceInput {
  subject: string;
  body: string;
  labels: string[];
  projectAliases: string[];
  sourceHints?: string[];
}

export interface GmailKnowledgeInput extends GmailRelevanceInput {
  id: string;
  threadId: string;
  observedAt: string;
  from?: string;
  to?: string[];
}

export interface GmailKnowledgeAdapterResult {
  persist: boolean;
  relevance: GmailRelevanceResult;
  source?: KnowledgeSourceRecord;
  entity?: CanonicalKnowledgeEntity;
}

export interface GmailRelevanceResult {
  score: number;
  reasons: string[];
  persist: boolean;
}

export interface WisebaseKnowledgeInput {
  id: string;
  title: string;
  observedAt: string;
  text?: string;
  url?: string;
  projectHints?: string[];
  metadata?: Record<string, unknown>;
}

function assertText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new TypeError(`${field} is required`);
  return trimmed;
}

function sourceRef(system: KnowledgeSourceRef['system'], id: string, url?: string): KnowledgeSourceRef {
  return { system, sourceNativeId: id, ...(url ? { url } : {}) };
}

function isSensitiveMetadataKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');

  return /^(?:access_|refresh_|auth_)?token$/.test(normalized)
    || /^(?:api_?key|secret|client_secret|password|passwd|authorization|cookie|cookies|credential|credentials)$/.test(normalized)
    || /^raw_(?:binary|payload|bytes|content)$/.test(normalized)
    || /(?:^|_)(?:access_token|refresh_token|api_key|client_secret)(?:_|$)/.test(normalized);
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadataValue);
  if (typeof value !== 'object' || value === null) return value;

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveMetadataKey(key)) continue;
    output[key] = sanitizeMetadataValue(nestedValue);
  }
  return output;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  return (sanitizeMetadataValue(metadata ?? {}) ?? {}) as Record<string, unknown>;
}

export function ingestDriveFile(input: DriveKnowledgeInput): KnowledgeAdapterResult {
  const id = assertText(input.id, 'Drive file id');
  const name = assertText(input.name, 'Drive file name');
  const contentHash = input.text === undefined ? undefined : hashCanonical(input.text);
  const metadata = {
    mimeType: input.mimeType,
    modifiedTime: input.modifiedTime,
    ...sanitizeMetadata(input.metadata),
  };
  const source = createSourceRecord({
    system: 'google-drive',
    sourceNativeId: id,
    title: name,
    observedAt: input.modifiedTime,
    metadata,
    projectHints: input.projectHints ?? [],
    ...(input.url ? { url: input.url } : {}),
    ...(contentHash ? { contentHash } : {}),
  });
  const ref = sourceRef('google-drive', id, input.url);
  const entity = createCanonicalEntity({
    kind: 'document',
    canonicalName: name,
    aliases: [],
    status: 'active',
    sourceRefs: [ref],
    tags: ['google-drive'],
    createdAt: input.modifiedTime,
    updatedAt: input.modifiedTime,
    metadata: {
      mimeType: input.mimeType,
      ...(contentHash ? { contentHash } : {}),
    },
  });
  return { source, entity, children: [] };
}

export function ingestConversation(input: ConversationKnowledgeInput): KnowledgeAdapterResult {
  const id = assertText(input.id, 'Conversation id');
  const title = assertText(input.title, 'Conversation title');
  const source = createSourceRecord({
    system: 'chat-history',
    sourceNativeId: id,
    title,
    observedAt: input.observedAt,
    contentHash: hashCanonical(input.messages.map((message) => ({ id: message.id, role: message.role, text: message.text, observedAt: message.observedAt }))),
    metadata: {
      messageCount: input.messages.length,
      ...sanitizeMetadata(input.metadata),
    },
    projectHints: input.projectHints ?? [],
  });
  const conversationRef = sourceRef('chat-history', id);
  const entity = createCanonicalEntity({
    kind: 'conversation',
    canonicalName: title,
    aliases: [],
    status: 'active',
    sourceRefs: [conversationRef],
    tags: ['chat-history'],
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
    metadata: { messageCount: input.messages.length },
  });
  const children = input.messages.map((message, order) => {
    const messageId = assertText(message.id, 'Message id');
    return createCanonicalEntity({
      kind: 'message',
      canonicalName: `${title} message ${order + 1}`,
      aliases: [],
      status: 'active',
      sourceRefs: [sourceRef('chat-history', `${id}:${messageId}`)],
      tags: ['chat-history', message.role],
      createdAt: message.observedAt,
      updatedAt: message.observedAt,
      metadata: {
        conversationId: id,
        messageId,
        role: message.role,
        order,
        contentHash: hashCanonical(message.text),
      },
    });
  });
  return { source, entity, children };
}

const AUTOMATED_MARKERS = [
  'category_promotions', 'promotion', 'promotional', 'newsletter', 'unsubscribe', 'receipt', 'marketing',
];
const OPPORTUNITY_MARKERS = [
  'client', 'proposal', 'contract', 'opportunity', 'project', 'freelance', 'investor', 'partnership', 'application', 'work request',
];
const OPERATIONS_MARKERS = [
  'deployment', 'deploy', 'operations', 'procurement', 'revenue recovery', 'margin', 'workflow', 'automation',
];

function containsMarker(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

export function scoreGmailKnowledgeRelevance(input: GmailRelevanceInput): GmailRelevanceResult {
  const combined = `${input.subject}\n${input.body}`.toLowerCase();
  const labels = input.labels.map((label) => label.toLowerCase());
  const reasons: string[] = [];
  let score = 0;

  const exactProject = input.projectAliases.some((alias) => {
    const candidate = alias.trim().toLowerCase();
    return candidate.length > 1 && combined.includes(candidate);
  });
  if (exactProject) {
    score += 0.35;
    reasons.push('project-or-repository-alias');
  }
  if (containsMarker(combined, OPPORTUNITY_MARKERS)) {
    score += 0.30;
    reasons.push('client-opportunity-contract-intent');
  }
  const hinted = (input.sourceHints ?? []).some((hint) => combined.includes(hint.trim().toLowerCase()));
  if (hinted) {
    score += 0.20;
    reasons.push('known-source-hint');
  }
  if (containsMarker(combined, OPERATIONS_MARKERS)) {
    score += 0.15;
    reasons.push('operations-procurement-revenue-intent');
  }
  if (labels.some((label) => AUTOMATED_MARKERS.some((marker) => label.includes(marker))) || containsMarker(combined, AUTOMATED_MARKERS)) {
    score -= 0.50;
    reasons.push('automated-or-promotional');
  }

  score = Number(Math.max(0, Math.min(1, score)).toFixed(2));
  return { score, reasons, persist: score >= 0.50 };
}

export function ingestGmailMessage(input: GmailKnowledgeInput): GmailKnowledgeAdapterResult {
  const relevance = scoreGmailKnowledgeRelevance(input);
  if (!relevance.persist) return { persist: false, relevance };

  const id = assertText(input.id, 'Gmail message id');
  const subject = assertText(input.subject, 'Gmail subject');
  const source = createSourceRecord({
    system: 'gmail',
    sourceNativeId: id,
    title: subject,
    observedAt: input.observedAt,
    contentHash: hashCanonical({ subject, body: input.body }),
    metadata: {
      threadId: input.threadId,
      labels: input.labels,
      relevanceScore: relevance.score,
      relevanceReasons: relevance.reasons,
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
    },
    projectHints: input.projectAliases,
  });
  const entity = createCanonicalEntity({
    kind: 'message',
    canonicalName: subject,
    aliases: [],
    status: 'active',
    sourceRefs: [sourceRef('gmail', id)],
    tags: ['gmail', 'relevant-knowledge'],
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
    metadata: {
      threadId: input.threadId,
      relevanceScore: relevance.score,
      relevanceReasons: relevance.reasons,
    },
  });
  return { persist: true, relevance, source, entity };
}

export function ingestWisebaseItem(input: WisebaseKnowledgeInput): KnowledgeAdapterResult {
  const id = assertText(input.id, 'Wisebase item id');
  const title = assertText(input.title, 'Wisebase item title');
  const contentHash = input.text === undefined ? undefined : hashCanonical(input.text);
  const safeMetadata = sanitizeMetadata(input.metadata);
  const source = createSourceRecord({
    system: 'wisebase',
    sourceNativeId: id,
    title,
    observedAt: input.observedAt,
    metadata: safeMetadata,
    projectHints: input.projectHints ?? [],
    ...(input.url ? { url: input.url } : {}),
    ...(contentHash ? { contentHash } : {}),
  });
  const entity = createCanonicalEntity({
    kind: 'document',
    canonicalName: title,
    aliases: [],
    status: 'active',
    sourceRefs: [sourceRef('wisebase', id, input.url)],
    tags: ['wisebase'],
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
    metadata: {
      ...safeMetadata,
      ...(contentHash ? { contentHash } : {}),
    },
  });
  return { source, entity, children: [] };
}
