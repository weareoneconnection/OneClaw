import { nanoid } from "nanoid";
import { redactJson, redactText } from "../security/redact.js";
export class PostgresTaskStore {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async create(params) {
        const now = new Date().toISOString();
        const record = redactJson({ id: nanoid(), createdAt: now, updatedAt: now, ...params });
        await this.pool.query(`insert into oneclaw_tasks (id, task_name, status, approval_mode, task_json, created_at, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, now(), now())`, [record.id, record.taskName, record.status, record.approvalMode, JSON.stringify(record)]);
        return record;
    }
    async get(taskId) {
        const result = await this.pool.query(`select task_json from oneclaw_tasks where id = $1`, [taskId]);
        return result.rows[0]?.task_json;
    }
    async list(params) {
        const limit = params?.limit ?? 50;
        const result = await this.pool.query(`select task_json from oneclaw_tasks order by updated_at desc limit $1`, [limit]);
        return result.rows.map((row) => row.task_json);
    }
    async update(taskId, updater) {
        const current = await this.get(taskId);
        if (!current)
            throw new Error(`Task not found: ${taskId}`);
        const updated = updater({ ...current, steps: [...current.steps], logs: [...current.logs] });
        updated.updatedAt = new Date().toISOString();
        await this.pool.query(`update oneclaw_tasks
          set status = $2,
              approval_mode = $3,
              task_name = $4,
              task_json = $5::jsonb,
              updated_at = now()
        where id = $1`, [taskId, updated.status, updated.approvalMode, updated.taskName, JSON.stringify(redactJson(updated))]);
        return updated;
    }
    async appendLog(taskId, message) {
        await this.update(taskId, (current) => ({
            ...current,
            logs: [...current.logs, `${new Date().toISOString()} ${redactText(message)}`],
        }));
    }
    async upsertStep(taskId, step) {
        await this.update(taskId, (current) => {
            const idx = current.steps.findIndex((item) => item.stepId === step.stepId);
            const steps = [...current.steps];
            if (idx >= 0)
                steps[idx] = step;
            else
                steps.push(step);
            return { ...current, steps };
        });
    }
    async createApproval(params) {
        const now = new Date().toISOString();
        const approval = redactJson({ id: nanoid(), createdAt: now, updatedAt: now, status: "pending", ...params });
        await this.pool.query(`insert into oneclaw_approvals (
         id, task_id, step_id, action, status, reason, input_json, approval_json, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now(), now())`, [approval.id, approval.taskId, approval.stepId, approval.action, approval.status, approval.reason, JSON.stringify(approval.input), JSON.stringify(approval)]);
        return approval;
    }
    async getApproval(approvalId) {
        const result = await this.pool.query(`select approval_json from oneclaw_approvals where id = $1`, [approvalId]);
        return result.rows[0]?.approval_json;
    }
    async getPendingApproval(taskId, stepId) {
        const result = await this.pool.query(`select approval_json from oneclaw_approvals where task_id = $1 and step_id = $2 and status = 'pending' order by created_at desc limit 1`, [taskId, stepId]);
        return result.rows[0]?.approval_json;
    }
    async getLatestApprovalForStep(taskId, stepId) {
        const result = await this.pool.query(`select approval_json from oneclaw_approvals where task_id = $1 and step_id = $2 order by updated_at desc limit 1`, [taskId, stepId]);
        return result.rows[0]?.approval_json;
    }
    async listPendingApprovals() {
        const result = await this.pool.query(`select approval_json from oneclaw_approvals where status = 'pending' order by created_at desc`);
        return result.rows.map((row) => row.approval_json);
    }
    async decideApproval(params) {
        const current = await this.getApproval(params.approvalId);
        if (!current)
            throw new Error(`Approval not found: ${params.approvalId}`);
        const updated = {
            ...current,
            status: params.status,
            updatedAt: new Date().toISOString(),
            decidedAt: new Date().toISOString(),
            decidedBy: params.decidedBy,
            decisionNote: params.decisionNote,
        };
        await this.pool.query(`update oneclaw_approvals
          set status = $2,
              approval_json = $3::jsonb,
              updated_at = now(),
              decided_at = now(),
              decided_by = $4,
              decision_note = $5
        where id = $1`, [params.approvalId, updated.status, JSON.stringify(redactJson(updated)), updated.decidedBy ?? null, updated.decisionNote ?? null]);
        return updated;
    }
    async getStats() {
        const taskCounts = await this.pool.query(`
      select status, count(*)::int as count
      from oneclaw_tasks
      group by status
    `);
        const approvalCounts = await this.pool.query(`select count(*)::int as count from oneclaw_approvals where status = 'pending'`);
        const byStatus = new Map();
        for (const row of taskCounts.rows)
            byStatus.set(row.status, Number(row.count));
        return {
            queued: byStatus.get('queued') ?? 0,
            running: byStatus.get('running') ?? 0,
            success: byStatus.get('success') ?? 0,
            failed: byStatus.get('failed') ?? 0,
            awaitingApproval: byStatus.get('awaiting_approval') ?? 0,
            rejected: byStatus.get('rejected') ?? 0,
            approvalsPending: Number(approvalCounts.rows[0]?.count ?? 0),
        };
    }
}
