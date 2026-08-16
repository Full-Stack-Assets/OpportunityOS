create table if not exists knowledge_entities (
  id text primary key,
  kind text not null,
  canonical_name text not null,
  normalized_name text not null,
  status text not null check (status in ('active','archived','superseded','draft')),
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  provenance_hash text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create table if not exists knowledge_entity_aliases (
  entity_id text not null references knowledge_entities(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  primary key (entity_id, normalized_alias)
);

create table if not exists knowledge_source_records (
  id text primary key,
  system text not null,
  source_native_id text,
  title text not null,
  normalized_title text not null,
  url text,
  observed_at timestamptz not null,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  project_hints jsonb not null default '[]'::jsonb,
  provenance_hash text not null,
  last_seen_at timestamptz not null default now(),
  unique(system, source_native_id)
);

create table if not exists knowledge_source_content (
  source_id text primary key references knowledge_source_records(id) on delete cascade,
  content_text text not null,
  content_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_entity_sources (
  entity_id text not null references knowledge_entities(id) on delete cascade,
  source_id text not null references knowledge_source_records(id) on delete cascade,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  primary key (entity_id, source_id)
);

create table if not exists knowledge_relationships (
  id text primary key,
  source_entity_id text not null references knowledge_entities(id) on delete cascade,
  target_entity_id text not null references knowledge_entities(id) on delete cascade,
  relationship_type text not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '[]'::jsonb,
  provenance_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_inbox (
  source_id text primary key references knowledge_source_records(id) on delete cascade,
  disposition text not null,
  target_entity_id text,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  reasons jsonb not null default '[]'::jsonb,
  state text not null default 'pending' check (state in ('pending','resolved','ignored')),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_embeddings (
  entity_id text primary key references knowledge_entities(id) on delete cascade,
  model text not null,
  dimensions integer not null check (dimensions > 0),
  vector jsonb not null,
  content_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_ingestion_receipts (
  id text primary key,
  source_system text not null,
  observed_at timestamptz not null,
  stats jsonb not null,
  receipt_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_entities_normalized_name_idx on knowledge_entities(normalized_name);
create index if not exists knowledge_alias_normalized_idx on knowledge_entity_aliases(normalized_alias);
create index if not exists knowledge_sources_system_native_idx on knowledge_source_records(system, source_native_id);
create index if not exists knowledge_source_content_fts_idx on knowledge_source_content using gin (to_tsvector('simple', content_text));
create index if not exists knowledge_relationship_source_idx on knowledge_relationships(source_entity_id);
create index if not exists knowledge_relationship_target_idx on knowledge_relationships(target_entity_id);
create index if not exists knowledge_inbox_state_idx on knowledge_inbox(state);
