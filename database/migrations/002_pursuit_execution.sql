CREATE TABLE IF NOT EXISTS pursuit_applications (
  pursuit_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  application_json JSONB NOT NULL,
  prepared_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pursuit_attempts (
  action_id TEXT PRIMARY KEY,
  pursuit_id TEXT NOT NULL REFERENCES pursuit_applications(pursuit_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  account_ref TEXT NOT NULL,
  executor_type TEXT NOT NULL,
  status TEXT NOT NULL,
  external_id TEXT,
  reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pursuit_attempts_pursuit_id_idx ON pursuit_attempts(pursuit_id);

CREATE TABLE IF NOT EXISTS pursuit_verifications (
  action_id TEXT PRIMARY KEY REFERENCES pursuit_attempts(action_id),
  verified BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  external_id TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  verified_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pursuit_receipts (
  receipt_hash TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  previous_receipt_hash TEXT,
  receipt_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
