export interface QueryResult<Row> {
  rows: Row[];
}

export interface SqlExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface StoredWorkOrder {
  id: string;
  state: string;
  revision: number;
}

interface WorkOrderRow extends Record<string, unknown> {
  id: string;
  state: string;
  revision: number;
}

export class PostgresOpportunityStore {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async putWorkOrder(workOrder: StoredWorkOrder): Promise<void> {
    await this.db.query(
      `insert into work_orders (id, state, revision, updated_at)
       values ($1, $2, $3, now())
       on conflict (id) do update
       set state = excluded.state,
           revision = excluded.revision,
           updated_at = now()`,
      [workOrder.id, workOrder.state, workOrder.revision],
    );
  }

  async getWorkOrder(id: string): Promise<StoredWorkOrder | undefined> {
    const result = await this.db.query<WorkOrderRow>(
      'select id, state, revision from work_orders where id = $1',
      [id],
    );
    const row = result.rows[0];
    return row ? { id: row.id, state: row.state, revision: row.revision } : undefined;
  }
}
