import { hashCanonical } from './canonical.ts';
import {
  classifyKnowledgeDisposition,
  resolveKnowledgeItem,
  type CanonicalKnowledgeEntity,
  type KnowledgeDisposition,
  type KnowledgeResolution,
  type KnowledgeSourceRecord,
  type KnowledgeSourceSystem,
} from './buildgraph-knowledge.ts';

export interface KnowledgeBatchStats {
  attempted: number;
  linked: number;
  updated: number;
  createdCandidates: number;
  review: number;
  skipped: number;
  failed: number;
}

export interface KnowledgeBatchItem {
  source: KnowledgeSourceRecord;
  resolution: KnowledgeResolution;
  disposition: KnowledgeDisposition;
}

export interface KnowledgeBatchFailure {
  inputIndex: number;
  reason: string;
}

export interface KnowledgeBatchResult {
  items: KnowledgeBatchItem[];
  failures: KnowledgeBatchFailure[];
  stats: KnowledgeBatchStats;
}

export interface KnowledgeIngestionReceipt {
  id: string;
  sourceSystem: KnowledgeSourceSystem;
  observedAt: string;
  stats: KnowledgeBatchStats;
  receiptHash: string;
}

function isSourceRecord(value: unknown): value is KnowledgeSourceRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Partial<KnowledgeSourceRecord>;
  return typeof item.id === 'string'
    && item.id.length > 0
    && typeof item.system === 'string'
    && typeof item.title === 'string'
    && item.title.trim().length > 0
    && typeof item.normalizedTitle === 'string'
    && typeof item.observedAt === 'string'
    && Number.isFinite(Date.parse(item.observedAt))
    && typeof item.provenanceHash === 'string'
    && typeof item.metadata === 'object'
    && item.metadata !== null
    && Array.isArray(item.projectHints);
}

export function ingestKnowledgeBatch(
  inputs: unknown[],
  existingEntities: CanonicalKnowledgeEntity[],
): KnowledgeBatchResult {
  if (!Array.isArray(inputs)) throw new TypeError('inputs must be an array');
  if (!Array.isArray(existingEntities)) throw new TypeError('existingEntities must be an array');

  const stats: KnowledgeBatchStats = {
    attempted: inputs.length,
    linked: 0,
    updated: 0,
    createdCandidates: 0,
    review: 0,
    skipped: 0,
    failed: 0,
  };
  const items: KnowledgeBatchItem[] = [];
  const failures: KnowledgeBatchFailure[] = [];

  for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
    const source = inputs[inputIndex];
    if (!isSourceRecord(source)) {
      stats.failed += 1;
      failures.push({ inputIndex, reason: 'invalid_source_record' });
      continue;
    }

    try {
      const resolution = resolveKnowledgeItem(source, existingEntities);
      const disposition = classifyKnowledgeDisposition(source, resolution);
      items.push({ source, resolution, disposition });
      if (disposition === 'LINK') stats.linked += 1;
      else if (disposition === 'UPDATE') stats.updated += 1;
      else if (disposition === 'CREATE_ENTITY') stats.createdCandidates += 1;
      else if (disposition === 'REVIEW' || disposition === 'MERGE' || disposition === 'SUPERSEDE' || disposition === 'ARCHIVE') stats.review += 1;
      else stats.skipped += 1;
    } catch (error) {
      stats.failed += 1;
      failures.push({ inputIndex, reason: error instanceof Error ? error.message : 'unknown_ingestion_error' });
    }
  }

  return { items, failures, stats };
}

export function createIngestionReceipt(
  sourceSystem: KnowledgeSourceSystem,
  observedAt: string,
  stats: KnowledgeBatchStats,
): KnowledgeIngestionReceipt {
  if (!Number.isFinite(Date.parse(observedAt))) throw new TypeError('observedAt must be a valid timestamp');
  const payload = { sourceSystem, observedAt, stats };
  const receiptHash = hashCanonical(payload);
  return {
    id: `knowledge-ingestion:${sourceSystem}:${receiptHash.slice(0, 20)}`,
    sourceSystem,
    observedAt,
    stats: { ...stats },
    receiptHash,
  };
}
