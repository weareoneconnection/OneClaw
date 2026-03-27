import { nanoid } from "nanoid";
import type { ApprovalRecord, TaskRunRecord, TaskStepResult, TaskStoreStats } from "../types/task.js";

export interface TaskStore {
  create(params: Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt">): Promise<TaskRunRecord>;
  get(taskId: string): Promise<TaskRunRecord | undefined>;
  list(params?: { limit?: number }): Promise<TaskRunRecord[]>;
  update(taskId: string, updater: (current: TaskRunRecord) => TaskRunRecord): Promise<TaskRunRecord>;
  appendLog(taskId: string, message: string): Promise<void>;
  upsertStep(taskId: string, step: TaskStepResult): Promise<void>;
  createApproval(params: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status">): Promise<ApprovalRecord>;
  getApproval(approvalId: string): Promise<ApprovalRecord | undefined>;
  getPendingApproval(taskId: string, stepId: string): Promise<ApprovalRecord | undefined>;
  listPendingApprovals(): Promise<ApprovalRecord[]>;
  decideApproval(params: {
    approvalId: string;
    status: "approved" | "rejected";
    decidedBy?: string;
    decisionNote?: string;
  }): Promise<ApprovalRecord>;
  getStats(): Promise<TaskStoreStats>;
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, TaskRunRecord>();
  private readonly approvals = new Map<string, ApprovalRecord>();

  async create(params: Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt">): Promise<TaskRunRecord> {
    const now = new Date().toISOString();
    const record: TaskRunRecord = { id: nanoid(), createdAt: now, updatedAt: now, ...params };
    this.tasks.set(record.id, record);
    return record;
  }

  async get(taskId: string): Promise<TaskRunRecord | undefined> {
    return this.tasks.get(taskId);
  }

  async list(params?: { limit?: number }): Promise<TaskRunRecord[]> {
    const limit = params?.limit ?? 50;
    return [...this.tasks.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async update(taskId: string, updater: (current: TaskRunRecord) => TaskRunRecord): Promise<TaskRunRecord> {
    const current = this.tasks.get(taskId);
    if (!current) throw new Error(`Task not found: ${taskId}`);
    const updated = updater({ ...current, steps: [...current.steps], logs: [...current.logs] });
    updated.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, updated);
    return updated;
  }

  async appendLog(taskId: string, message: string): Promise<void> {
    await this.update(taskId, (current) => ({
      ...current,
      logs: [...current.logs, `${new Date().toISOString()} ${message}`],
    }));
  }

  async upsertStep(taskId: string, step: TaskStepResult): Promise<void> {
    await this.update(taskId, (current) => {
      const idx = current.steps.findIndex((item) => item.stepId === step.stepId);
      const steps = [...current.steps];
      if (idx >= 0) steps[idx] = step;
      else steps.push(step);
      return { ...current, steps };
    });
  }

  async createApproval(params: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status">): Promise<ApprovalRecord> {
    const now = new Date().toISOString();
    const approval: ApprovalRecord = {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      status: "pending",
      ...params,
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  async getApproval(approvalId: string): Promise<ApprovalRecord | undefined> {
    return this.approvals.get(approvalId);
  }

  async getPendingApproval(taskId: string, stepId: string): Promise<ApprovalRecord | undefined> {
    return [...this.approvals.values()].find((item) => item.taskId === taskId && item.stepId === stepId && item.status === "pending");
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    return [...this.approvals.values()]
      .filter((item) => item.status === "pending")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async decideApproval(params: {
    approvalId: string;
    status: "approved" | "rejected";
    decidedBy?: string;
    decisionNote?: string;
  }): Promise<ApprovalRecord> {
    const current = this.approvals.get(params.approvalId);
    if (!current) throw new Error(`Approval not found: ${params.approvalId}`);
    const updated: ApprovalRecord = {
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

  async getStats(): Promise<TaskStoreStats> {
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
