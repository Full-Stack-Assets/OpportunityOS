import type {
  CanonicalKnowledgeEntity,
  KnowledgeDisposition,
  KnowledgeRelationshipCandidate,
  KnowledgeRetrievalCandidate,
  KnowledgeSourceRecord,
  KnowledgeSourceRef,
  KnowledgeSourceSystem,
} from '@opportunityos/core';

import type { SqlExecutor } from './store.ts';

export interface KnowledgeInboxRecord {
  sourceId: string;
  disposition: KnowledgeDisposition;
  targetEntityId?: string;
  confidence: number;
  reasons: string[];
  state?: 'pending' | 'resolved' | 'ignored';
}

export interface KnowledgeEmbeddingRecord {
  entityId: string;
  model: string;
  vector: number[];
  contentHash: string;
}

export interface KnowledgeIngestionReceiptRecord {
  id: string;
  sourceSystem: KnowledgeSourceSystem;
  observedAt: string;
  stats: Record<string, number>;
  receiptHash: string;
}

export interface StoredKnowledgeEntity {
  id: string;
  kind: CanonicalKnowledgeEntity['kind'];
  canonicalName: string;
  normalizedName: string;
  status: CanonicalKnowledgeEntity['status'];
  tags: string[];
  metadata: Record<string, unknown>;
  provenanceHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredKnowledgeSource {
  id: string;
  system: KnowledgeSourceSystem;
  sourceNativeId?: string;
  title: string;
  normalizedTitle: string;
  url?: string;
  observedAt: string;
  contentHash?: string;
  metadata: Record<string, unknown>;
  projectHints: string[];
  provenanceHash: string;
}

const REPOSITORY_SUFFIXES = new Set(['app', 'cc', 'com', 'dev', 'io', 'net', 'online', 'org', 'site', 'space']);

function normalizeRegistryKey(value: string): string {
  const spaced = value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const tokens = spaced.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && REPOSITORY_SUFFIXES.has(tokens[tokens.length - 1] ?? '')) tokens.pop();
  return tokens.join('');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return value as number[];
}

function asSourceRefs(value: unknown): KnowledgeSourceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: KnowledgeSourceRef[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const system = row.system;
    const sourceNativeId = row.sourceNativeId ?? row.source_native_id;
    const url = row.url;
    if (typeof system !== 'string' || typeof sourceNativeId !== 'string' || !sourceNativeId) continue;
    refs.push({
      system: system as KnowledgeSourceSystem,
      sourceNativeId,
      ...(typeof url === 'string' && url ? { url } : {}),
    });
  }
  return refs;
}

function mapEntityRow(row: Record<string, unknown>): StoredKnowledgeEntity {
  return {
    id: asString(row.id),
    kind: asString(row.kind) as StoredKnowledgeEntity['kind'],
    canonicalName: asString(row.canonical_name),
    normalizedName: asString(row.normalized_name),
    status: asString(row.status) as StoredKnowledgeEntity['status'],
    tags: asStringArray(row.tags),
    metadata: asJsonObject(row.metadata),
    provenanceHash: asString(row.provenance_hash),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapSourceRow(row: Record<string, unknown>): StoredKnowledgeSource {
  const sourceNativeId = row.source_native_id == null ? undefined : asString(row.source_native_id);
  const url = row.url == null ? undefined : asString(row.url);
  const contentHash = row.content_hash == null ? undefined : asString(row.content_hash);
  return {
    id: asString(row.id),
    system: asString(row.system) as KnowledgeSourceSystem,
    ...(sourceNativeId ? { sourceNativeId } : {}),
    title: asString(row.title),
    normalizedTitle: asString(row.normalized_title),
    ...(url ? { url } : {}),
    observedAt: asString(row.observed_at),
    ...(contentHash ? { contentHash } : {}),
    metadata: asJsonObject(row.metadata),
    projectHints: asStringArray(row.project_hints),
    provenanceHash: asString(row.provenance_hash),
  };
}

function mapRetrievalRow(row: Record<string, unknown>): KnowledgeRetrievalCandidate {
  const embedding = asNumberArray(row.embedding);
  return {
    id: asString(row.id),
    kind: asString(row.kind) as KnowledgeRetrievalCandidate['kind'],
    canonicalName: asString(row.canonical_name),
    status: asString(row.status) as KnowledgeRetrievalCandidate['status'],
    normalizedName: asString(row.normalized_name),
    aliases: asStringArray(row.aliases),
    sourceRefs: asSourceRefs(row.source_refs),
    text: asString(row.text_content),
    relationships: asStringArray(row.relationships),
    ...(embedding ? { embedding } : {}),
  };
}

export class PostgresKnowledgeStore {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async putEntity(entity: CanonicalKnowledgeEntity): Promise<void> {
    await this.db.query(
      `insert into knowledge_entities
        (id, kind, canonical_name, normalized_name, status, tags, metadata, provenance_hash, created_at, updated_at, last_seen_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,now())
       on conflict (id) do update set
         kind = excluded.kind,
         canonical_name = excluded.canonical_name,
         normalized_name = excluded.normalized_name,
         status = excluded.status,
         tags = excluded.tags,
         metadata = excluded.metadata,
         provenance_hash = excluded.provenance_hash,
         updated_at = excluded.updated_at,
         last_seen_at = now()`,
      [
        entity.id,
        entity.kind,
        entity.canonicalName,
        entity.normalizedName,
        entity.status,
        JSON.stringify(entity.tags),
        JSON.stringify(entity.metadata ?? {}),
        entity.provenanceHash,
        entity.createdAt,
        entity.updatedAt,
      ],
    );

    for (const alias of entity.aliases) {
      const normalizedAlias = normalizeRegistryKey(alias);
      if (!normalizedAlias) continue;
      await this.db.query(
        `insert into knowledge_entity_aliases (entity_id, alias, normalized_alias)
         values ($1,$2,$3)
         on conflict (entity_id, normalized_alias) do update set alias = excluded.alias`,
        [entity.id, alias, normalizedAlias],
      );
    }
  }

  async putSourceRecord(source: KnowledgeSourceRecord): Promise<void> {
    await this.db.query(
      `insert into knowledge_source_records
        (id, system, source_native_id, title, normalized_title, url, observed_at, content_hash, metadata, project_hints, provenance_hash, last_seen_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,now())
       on conflict (id) do update set
         title = excluded.title,
         normalized_title = excluded.normalized_title,
         url = excluded.url,
         observed_at = excluded.observed_at,
         content_hash = excluded.content_hash,
         metadata = excluded.metadata,
         project_hints = excluded.project_hints,
         provenance_hash = excluded.provenance_hash,
         last_seen_at = now()`,
      [
        source.id,
        source.system,
        source.sourceNativeId ?? null,
        source.title,
        source.normalizedTitle,
        source.url ?? null,
        source.observedAt,
        source.contentHash ?? null,
        JSON.stringify(source.metadata),
        JSON.stringify(source.projectHints),
        source.provenanceHash,
      ],
    );
  }

  async putSourceContent(sourceId: string, contentText: string, contentHash: string): Promise<void> {
    if (!sourceId.trim()) throw new TypeError('sourceId is required');
    if (!contentHash.trim()) throw new TypeError('contentHash is required');
    await this.db.query(
      `insert into knowledge_source_content (source_id, content_text, content_hash, updated_at)
       values ($1,$2,$3,now())
       on conflict (source_id) do update set
         content_text = excluded.content_text,
         content_hash = excluded.content_hash,
         updated_at = now()`,
      [sourceId, contentText, contentHash],
    );
  }

  async linkEntitySource(entityId: string, sourceId: string, confidence = 1): Promise<void> {
    await this.db.query(
      `insert into knowledge_entity_sources (entity_id, source_id, confidence)
       values ($1,$2,$3)
       on conflict (entity_id, source_id) do update set confidence = excluded.confidence`,
      [entityId, sourceId, confidence],
    );
  }

  async putRelationship(relationship: KnowledgeRelationshipCandidate): Promise<void> {
    await this.db.query(
      `insert into knowledge_relationships
        (id, source_entity_id, target_entity_id, relationship_type, confidence, evidence, provenance_hash, updated_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,now())
       on conflict (id) do update set
         confidence = excluded.confidence,
         evidence = excluded.evidence,
         provenance_hash = excluded.provenance_hash,
         updated_at = now()`,
      [
        relationship.id,
        relationship.sourceEntityId,
        relationship.targetEntityId,
        relationship.type,
        relationship.confidence,
        JSON.stringify(relationship.evidence),
        relationship.provenanceHash,
      ],
    );
  }

  async putInboxItem(item: KnowledgeInboxRecord): Promise<void> {
    await this.db.query(
      `insert into knowledge_inbox
        (source_id, disposition, target_entity_id, confidence, reasons, state, updated_at)
       values ($1,$2,$3,$4,$5::jsonb,$6,now())
       on conflict (source_id) do update set
         disposition = excluded.disposition,
         target_entity_id = excluded.target_entity_id,
         confidence = excluded.confidence,
         reasons = excluded.reasons,
         state = excluded.state,
         updated_at = now()`,
      [item.sourceId, item.disposition, item.targetEntityId ?? null, item.confidence, JSON.stringify(item.reasons), item.state ?? 'pending'],
    );
  }

  async putEmbedding(embedding: KnowledgeEmbeddingRecord): Promise<void> {
    if (embedding.vector.length === 0 || embedding.vector.some((value) => !Number.isFinite(value))) {
      throw new TypeError('Embedding vector must contain finite values');
    }
    await this.db.query(
      `insert into knowledge_embeddings (entity_id, model, dimensions, vector, content_hash, updated_at)
       values ($1,$2,$3,$4::jsonb,$5,now())
       on conflict (entity_id) do update set
         model = excluded.model,
         dimensions = excluded.dimensions,
         vector = excluded.vector,
         content_hash = excluded.content_hash,
         updated_at = now()`,
      [embedding.entityId, embedding.model, embedding.vector.length, JSON.stringify(embedding.vector), embedding.contentHash],
    );
  }

  async recordReceipt(receipt: KnowledgeIngestionReceiptRecord): Promise<void> {
    await this.db.query(
      `insert into knowledge_ingestion_receipts (id, source_system, observed_at, stats, receipt_hash)
       values ($1,$2,$3,$4::jsonb,$5)
       on conflict (id) do update set stats = excluded.stats, receipt_hash = excluded.receipt_hash`,
      [receipt.id, receipt.sourceSystem, receipt.observedAt, JSON.stringify(receipt.stats), receipt.receiptHash],
    );
  }

  async getEntities(ids?: string[]): Promise<StoredKnowledgeEntity[]> {
    const result = ids && ids.length > 0
      ? await this.db.query<Record<string, unknown>>(
          `select id, kind, canonical_name, normalized_name, status, tags, metadata, provenance_hash, created_at, updated_at
           from knowledge_entities where id = any($1::text[]) order by canonical_name, id`,
          [ids],
        )
      : await this.db.query<Record<string, unknown>>(
          `select id, kind, canonical_name, normalized_name, status, tags, metadata, provenance_hash, created_at, updated_at
           from knowledge_entities order by canonical_name, id`,
        );
    return result.rows.map(mapEntityRow);
  }

  async getSourcesByEntity(entityId: string): Promise<StoredKnowledgeSource[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `select s.id, s.system, s.source_native_id, s.title, s.normalized_title, s.url, s.observed_at,
              s.content_hash, s.metadata, s.project_hints, s.provenance_hash
       from knowledge_source_records s
       join knowledge_entity_sources es on es.source_id = s.id
       where es.entity_id = $1
       order by s.observed_at desc, s.id`,
      [entityId],
    );
    return result.rows.map(mapSourceRow);
  }

  async searchRegistry(query: string, limit = 20): Promise<StoredKnowledgeEntity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError('limit must be an integer between 1 and 200');
    const normalized = normalizeRegistryKey(query);
    if (!normalized) return [];
    const result = await this.db.query<Record<string, unknown>>(
      `select distinct e.id, e.kind, e.canonical_name, e.normalized_name, e.status, e.tags, e.metadata,
              e.provenance_hash, e.created_at, e.updated_at
       from knowledge_entities e
       left join knowledge_entity_aliases a on a.entity_id = e.id
       where e.normalized_name = $1
          or a.normalized_alias = $1
          or e.normalized_name like $2
          or a.normalized_alias like $2
       order by e.canonical_name, e.id
       limit $3`,
      [normalized, `%${normalized}%`, limit],
    );
    return result.rows.map(mapEntityRow);
  }

  async searchRetrievalCandidates(query: string, limit = 50): Promise<KnowledgeRetrievalCandidate[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError('limit must be an integer between 1 and 200');
    const normalized = normalizeRegistryKey(trimmed);
    const likePattern = normalized ? `%${normalized}%` : '%';
    const result = await this.db.query<Record<string, unknown>>(
      `select
         e.id,
         e.kind,
         e.canonical_name,
         e.normalized_name,
         e.status,
         coalesce(array_agg(distinct a.alias) filter (where a.alias is not null), '{}'::text[]) as aliases,
         coalesce(
           jsonb_agg(distinct jsonb_build_object(
             'system', s.system,
             'sourceNativeId', s.source_native_id,
             'url', s.url
           )) filter (where s.id is not null and s.source_native_id is not null),
           '[]'::jsonb
         ) as source_refs,
         coalesce(string_agg(distinct c.content_text, E'\n'), '') as text_content,
         coalesce(
           array_agg(distinct case
             when r.source_entity_id = e.id then r.target_entity_id
             else r.source_entity_id
           end) filter (where r.id is not null),
           '{}'::text[]
         ) as relationships,
         emb.vector as embedding
       from knowledge_entities e
       left join knowledge_entity_aliases a on a.entity_id = e.id
       left join knowledge_entity_sources es on es.entity_id = e.id
       left join knowledge_source_records s on s.id = es.source_id
       left join knowledge_source_content c on c.source_id = s.id
       left join knowledge_relationships r on r.source_entity_id = e.id or r.target_entity_id = e.id
       left join knowledge_embeddings emb on emb.entity_id = e.id
       where e.normalized_name = $2
          or a.normalized_alias = $2
          or e.normalized_name like $3
          or a.normalized_alias like $3
          or s.normalized_title like $3
          or to_tsvector('simple', coalesce(c.content_text, '')) @@ plainto_tsquery('simple', $1)
       group by e.id, e.kind, e.canonical_name, e.normalized_name, e.status, emb.vector
       order by (e.normalized_name = $2) desc, e.canonical_name, e.id
       limit $4`,
      [trimmed, normalized, likePattern, limit],
    );
    return result.rows.map(mapRetrievalRow);
  }
}
