create table if not exists knowledge_project_policies (
  project_id text primary key references knowledge_entities(id) on delete cascade,
  preflight_required boolean not null default true,
  routine_bypass_allowed boolean not null default true,
  exemption_decision_id text references knowledge_entities(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_preflight_receipts (
  id text primary key,
  work_id text not null,
  project_id text references knowledge_entities(id) on delete set null,
  scope text not null check (scope in ('ROUTINE','SUBSTANTIAL')),
  outcome text not null,
  reason text not null,
  decision text,
  justification text,
  evidence jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  receipt_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_preflight_receipts_project_idx
  on knowledge_preflight_receipts(project_id, generated_at desc);

create index if not exists knowledge_preflight_receipts_work_idx
  on knowledge_preflight_receipts(work_id, generated_at desc);
