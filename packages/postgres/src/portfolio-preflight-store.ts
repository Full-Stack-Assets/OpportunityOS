import type {
  BuildGraphDecision,
  PortfolioPreflightReceipt,
  PortfolioPreflightReason,
  WorkScope,
} from '@opportunityos/core';

import type { SqlExecutor } from './store.ts';

export interface KnowledgeProjectPolicyRecord {
  projectId: string;
  preflightRequired: boolean;
  routineBypassAllowed: boolean;
  exemptionDecisionId?: string;
  updatedAt: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapPolicyRow(row: Record<string, unknown>): KnowledgeProjectPolicyRecord {
  const exemptionDecisionId = row.exemption_decision_id == null ? undefined : asString(row.exemption_decision_id);
  return {
    projectId: asString(row.project_id),
    preflightRequired: Boolean(row.preflight_required),
    routineBypassAllowed: Boolean(row.routine_bypass_allowed),
    ...(exemptionDecisionId ? { exemptionDecisionId } : {}),
    updatedAt: asString(row.updated_at),
  };
}

function mapReceiptRow(row: Record<string, unknown>): PortfolioPreflightReceipt {
  const projectId = row.project_id == null ? undefined : asString(row.project_id);
  const decision = row.decision == null ? undefined : asString(row.decision) as BuildGraphDecision;
  const justification = row.justification == null ? undefined : asString(row.justification);
  const evidence = asJsonObject(row.evidence) as PortfolioPreflightReceipt['evidence'];
  return {
    id: asString(row.id),
    workId: asString(row.work_id),
    ...(projectId ? { projectId } : {}),
    scope: asString(row.scope) as WorkScope,
    outcome: asString(row.outcome) as PortfolioPreflightReason,
    reason: asString(row.reason) as PortfolioPreflightReason,
    ...(decision ? { decision } : {}),
    ...(justification ? { justification } : {}),
    evidence,
    generatedAt: asString(row.generated_at),
    receiptHash: asString(row.receipt_hash),
  };
}

export class PostgresPortfolioPreflightStore {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async putProjectPolicy(policy: KnowledgeProjectPolicyRecord): Promise<void> {
    await this.db.query(
      `insert into knowledge_project_policies
        (project_id, preflight_required, routine_bypass_allowed, exemption_decision_id, updated_at)
       values ($1,$2,$3,$4,$5)
       on conflict (project_id) do update set
         preflight_required = excluded.preflight_required,
         routine_bypass_allowed = excluded.routine_bypass_allowed,
         exemption_decision_id = excluded.exemption_decision_id,
         updated_at = excluded.updated_at`,
      [
        policy.projectId,
        policy.preflightRequired,
        policy.routineBypassAllowed,
        policy.exemptionDecisionId ?? null,
        policy.updatedAt,
      ],
    );
  }

  async getProjectPolicy(projectId: string): Promise<KnowledgeProjectPolicyRecord | undefined> {
    const result = await this.db.query<Record<string, unknown>>(
      `select project_id, preflight_required, routine_bypass_allowed, exemption_decision_id, updated_at
       from knowledge_project_policies where project_id = $1`,
      [projectId],
    );
    return result.rows[0] ? mapPolicyRow(result.rows[0]) : undefined;
  }

  async recordPreflightReceipt(receipt: PortfolioPreflightReceipt): Promise<void> {
    await this.db.query(
      `insert into knowledge_preflight_receipts
        (id, work_id, project_id, scope, outcome, reason, decision, justification, evidence, generated_at, receipt_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
       on conflict (id) do update set
         receipt_hash = excluded.receipt_hash
       where knowledge_preflight_receipts.receipt_hash = excluded.receipt_hash`,
      [
        receipt.id,
        receipt.workId,
        receipt.projectId ?? null,
        receipt.scope,
        receipt.outcome,
        receipt.reason,
        receipt.decision ?? null,
        receipt.justification ?? null,
        JSON.stringify(receipt.evidence),
        receipt.generatedAt,
        receipt.receiptHash,
      ],
    );
  }

  async getPreflightReceipt(receiptId: string): Promise<PortfolioPreflightReceipt | undefined> {
    const result = await this.db.query<Record<string, unknown>>(
      `select id, work_id, project_id, scope, outcome, reason, decision, justification, evidence, generated_at, receipt_hash
       from knowledge_preflight_receipts where id = $1`,
      [receiptId],
    );
    return result.rows[0] ? mapReceiptRow(result.rows[0]) : undefined;
  }
}
