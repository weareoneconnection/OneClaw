import { nanoid } from "nanoid";
export class InMemoryTaskStore {
    tasks = new Map();
    approvals = new Map();
    async create(params) {
        const now = new Date().toISOString();
        const record = { id: nanoid(), createdAt: now, updatedAt: now, ...params };
        this.tasks.set(record.id, record);
        return record;
    }
    async get(taskId) {
        return this.tasks.get(taskId);
    }
    async list(params) {
        const limit = params?.limit ?? 50;
        return [...this.tasks.values()]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit);
    }
    async update(taskId, updater) {
        const current = this.tasks.get(taskId);
        if (!current)
            throw new Error(`Task not found: ${taskId}`);
        const updated = updater({ ...current, steps: [...current.steps], logs: [...current.logs] });
        updated.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, updated);
        return updated;
    }
    async appendLog(taskId, message) {
        await this.update(taskId, (current) => ({
            ...current,
            logs: [...current.logs, `${new Date().toISOString()} ${message}`],
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
        const approval = {
            id: nanoid(),
            createdAt: now,
            updatedAt: now,
            status: "pending",
            ...params,
        };
        this.approvals.set(approval.id, approval);
        return approval;
    }
    async getApproval(approvalId) {
        return this.approvals.get(approvalId);
    }
    async getPendingApproval(taskId, stepId) {
        return [...this.approvals.values()].find((item) => item.taskId === taskId && item.stepId === stepId && item.status === "pending");
    }
    async listPendingApprovals() {
        return [...this.approvals.values()]
            .filter((item) => item.status === "pending")
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    async decideApproval(params) {
        const current = this.approvals.get(params.approvalId);
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
        this.approvals.set(params.approvalId, updated);
        return updated;
    }
    async getStats() {
        const tasks = [...this.tasks.values()];
        const pendingApprovals = [...this.approvals.values()].filter((item) => item.status === 'pending').length;
        return {
            queued: tasks.filter((t) => t.status === 'queued').length,
            running: tasks.filter((t) => t.status === 'running').length,
            success: tasks.filter((t) => t.status === 'success').length,
            failed: tasks.filter((t) => t.status === 'failed').length,
            awaitingApproval: tasks.filter((t) => t.status === 'awaiting_approval').length,
            rejected: tasks.filter((t) => t.status === 'rejected').length,
            approvalsPending: pendingApprovals,
        };
    }
}
