import type { SqlExecutor } from './store.ts';

export interface PreparedApplicationRecord {
  pursuitId: string; opportunityId: string; platform: string; payloadHash: string; application: unknown; preparedAt: string; expiresAt: string;
}
export interface PursuitAttemptRecord { actionId: string; status: string; externalId?: string; reconciliationRequired: boolean }
interface AttemptRow extends Record<string, unknown> { action_id: string; status: string; external_id: string | null; reconciliation_required: boolean }

export class PostgresPursuitStore {
  private readonly db: SqlExecutor;
  constructor(db: SqlExecutor) { this.db = db; }

  async savePreparedApplication(record: PreparedApplicationRecord): Promise<void> {
    await this.db.query(
      `insert into pursuit_applications (pursuit_id, opportunity_id, platform, payload_hash, application_json, prepared_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (pursuit_id) do update set opportunity_id = excluded.opportunity_id, platform = excluded.platform,
       payload_hash = excluded.payload_hash, application_json = excluded.application_json, prepared_at = excluded.prepared_at, expires_at = excluded.expires_at`,
      [record.pursuitId, record.opportunityId, record.platform, record.payloadHash, record.application, record.preparedAt, record.expiresAt],
    );
  }

  async beginAttempt(input: { actionId: string; pursuitId: string; idempotencyKey: string; accountRef: string; executorType: string; status: string }): Promise<void> {
    await this.db.query(`insert into pursuit_attempts (action_id, pursuit_id, idempotency_key, account_ref, executor_type, status) values ($1, $2, $3, $4, $5, $6)`, [input.actionId, input.pursuitId, input.idempotencyKey, input.accountRef, input.executorType, input.status]);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PursuitAttemptRecord | undefined> {
    const result = await this.db.query<AttemptRow>(`select action_id, status, external_id, reconciliation_required from pursuit_attempts where idempotency_key = $1`, [idempotencyKey]);
    const row = result.rows[0];
    if (!row) return undefined;
    return { actionId: row.action_id, status: row.status, ...(row.external_id === null ? {} : { externalId: row.external_id }), reconciliationRequired: row.reconciliation_required };
  }

  async recordExecution(actionId: string, status: string, externalId?: string): Promise<void> {
    const reconciliationRequired = status === 'EXECUTED_UNVERIFIED';
    await this.db.query(`update pursuit_attempts set status = $2, external_id = $3, reconciliation_required = $4, updated_at = now() where action_id = $1`, [actionId, status, externalId ?? null, reconciliationRequired]);
  }

  async recordVerification(input: { actionId: string; verified: boolean; status: string; externalId?: string; evidenceRefs: string[]; reason?: string; verifiedAt: string }): Promise<void> {
    await this.db.query(
      `insert into pursuit_verifications (action_id, verified, status, external_id, evidence_refs, reason, verified_at) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (action_id) do update set verified = excluded.verified, status = excluded.status, external_id = excluded.external_id, evidence_refs = excluded.evidence_refs, reason = excluded.reason, verified_at = excluded.verified_at`,
      [input.actionId, input.verified, input.status, input.externalId ?? null, input.evidenceRefs, input.reason ?? null, input.verifiedAt],
    );
  }

  async markReconciliationRequired(actionId: string): Promise<void> {
    await this.db.query(`update pursuit_attempts set reconciliation_required = true, updated_at = now() where action_id = $1`, [actionId]);
  }

  async appendReceipt(input: { receiptHash: string; actionId: string; previousReceiptHash?: string; receipt: unknown }): Promise<void> {
    await this.db.query(`insert into pursuit_receipts (receipt_hash, action_id, previous_receipt_hash, receipt_json) values ($1, $2, $3, $4)`, [input.receiptHash, input.actionId, input.previousReceiptHash ?? null, input.receipt]);
  }
}
