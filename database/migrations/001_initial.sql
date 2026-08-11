begin;

create table if not exists opportunities (
  id text primary key,
  source text not null,
  title text not null,
  description text not null,
  status text not null check (status in ('DISCOVERED','QUALIFIED','PURSUING','NEEDS_YOU','REJECTED','WON','LOST','EXPIRED')),
  capability_fit integer not null check (capability_fit between 0 and 100),
  evidence_quality integer not null check (evidence_quality between 0 and 100),
  expected_value_cents bigint,
  effort_points numeric(10,2) not null check (effort_points >= 0),
  deadline_urgency integer not null check (deadline_urgency between 0 and 100),
  source_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_value_cents is null or expected_value_cents >= 0)
);

create table if not exists buildgraph_preflights (
  request_id text primary key,
  work_order_id text,
  decision text not null,
  justification text not null,
  payload_hash text not null,
  result jsonb not null,
  generated_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table if not exists work_orders (
  id text primary key,
  opportunity_id text references opportunities(id),
  state text not null check (state in ('DRAFT','BUILDGRAPH_PREFLIGHT','POLICY_EVALUATION','REVIEW_REQUIRED','APPROVED','READY','EXECUTING','VERIFYING','COMPLETED','NEEDS_YOU','FAILED','CANCELLED')),
  revision integer not null default 0 check (revision >= 0),
  factory text check (factory in ('SOFTWARE_WEB','RESEARCH_DOCUMENTS','AUTOMATION')),
  execution_mode text not null default 'SIMULATION' check (execution_mode = 'SIMULATION'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table buildgraph_preflights
  drop constraint if exists buildgraph_preflights_work_order_id_fkey;
alter table buildgraph_preflights
  add constraint buildgraph_preflights_work_order_id_fkey
  foreign key (work_order_id) references work_orders(id) deferrable initially deferred;

create table if not exists requirements (
  id text not null,
  work_order_id text not null references work_orders(id) on delete cascade,
  description text not null,
  depends_on text[] not null default '{}',
  position integer not null,
  primary key (work_order_id, id)
);

create table if not exists approvals (
  approval_id text primary key,
  work_order_id text references work_orders(id),
  action_id text not null,
  action_type text not null,
  payload_hash text not null,
  subject text not null,
  expires_at timestamptz not null,
  signature text not null,
  recorded_at timestamptz not null default now()
);

create table if not exists artifacts (
  id text primary key,
  work_order_id text not null references work_orders(id),
  kind text not null,
  uri text,
  content_hash text not null,
  verification_status text not null check (verification_status in ('UNVERIFIED','VERIFIED','FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists receipts (
  receipt_hash text primary key,
  work_order_id text references work_orders(id),
  action_id text not null,
  outcome text not null,
  previous_receipt_hash text references receipts(receipt_hash),
  evidence jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table if not exists economics (
  work_order_id text primary key references work_orders(id),
  revenue_cents bigint,
  cost_cents bigint,
  contribution_cents bigint,
  evidence_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  check (revenue_cents is null or revenue_cents >= 0),
  check (cost_cents is null or cost_cents >= 0),
  check ((not evidence_complete) or (revenue_cents is not null and cost_cents is not null and contribution_cents = revenue_cents - cost_cents))
);

create table if not exists telemetry_events (
  id bigserial primary key,
  work_order_id text references work_orders(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);

create index if not exists idx_opportunities_status on opportunities(status);
create index if not exists idx_work_orders_state on work_orders(state);
create index if not exists idx_receipts_work_order on receipts(work_order_id, occurred_at);
create index if not exists idx_telemetry_work_order on telemetry_events(work_order_id, occurred_at);

commit;
