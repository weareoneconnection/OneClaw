import { Pool } from "pg";
import type { AppConfig } from "../../config.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class DatabaseWorker implements Worker {
  readonly name = "database_worker";

  constructor(private readonly config: AppConfig) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`DatabaseWorker executing ${context.action}`);
    const connectionString = asString(input.connectionString) || this.config.databaseUrl;

    if (context.action === "database.query") {
      const sql = asString(input.sql);
      if (!sql) return { ok: false, error: "database.query requires input.sql" };
      if (!/^select\b/i.test(sql)) return { ok: false, error: "database.query only allows SELECT. Use database.write with approval for writes." };
      if (!connectionString) return { ok: true, output: { action: context.action, status: "query_prepared", sql } };

      const pool = new Pool({ connectionString });
      try {
        const result = await pool.query(sql);
        return { ok: true, output: { action: context.action, rowCount: result.rowCount ?? 0, rows: result.rows as Json } };
      } finally {
        await pool.end();
      }
    }

    if (context.action === "database.write") {
      return { ok: true, output: { action: context.action, status: "write_prepared", sql: asString(input.sql), approvalRequired: true } };
    }

    if (context.action === "database.schema.inspect") {
      return { ok: true, output: { action: context.action, status: "schema_inspection_prepared" } };
    }

    return { ok: false, error: `Unsupported database action: ${context.action}` };
  }
}
