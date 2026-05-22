import { nanoid } from "nanoid";
import { redactJson, redactText } from "../security/redact.js";
import type {
  ApprovalRecord,
  TaskRunRecord,
  TaskStepResult,
  TaskStoreStats,
} from "../types/task.js";

export interface TaskStore {
  create(
    params: Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<TaskRunRecord>;

  get(taskId: string): Promise<TaskRunRecord | undefined>;

  list(params?: { limit?: number }): Promise<TaskRunRecord[]>;

  update(
    taskId: string,
    updater: (current: TaskRunRecord) => TaskRunRecord,
  ): Promise<TaskRunRecord>;

  appendLog(taskId: string, message: string): Promise<void>;

  upsertStep(taskId: string, step: TaskStepResult): Promise<void>;

  createApproval(
    params: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status">,
  ): Promise<ApprovalRecord>;

  getApproval(approvalId: string): Promise<ApprovalRecord | undefined>;

  getPendingApproval(
    taskId: string,
    stepId: string,
  ): Promise<ApprovalRecord | undefined>;

  listPendingApprovals(): Promise<ApprovalRecord[]>;

  decideApproval(params: {
    approvalId: string;
    status: "approved" | "rejected";
    decidedBy?: string;
    decisionNote?: string;
  }): Promise<ApprovalRecord>;

  getStats(): Promise<TaskStoreStats>;
}

class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.tails.set(key, previous.then(() => current));

    await previous;

    try {
      return await fn();
    } finally {
      release();

      const tail = this.tails.get(key);
      if (tail) {
        void tail.finally(() => {
          if (this.tails.get(key) === tail) {
            this.tails.delete(key);
          }
        });
      }
    }
  }
}

class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.tail = previous.then(() => current);

    await previous;

    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, TaskRunRecord>();
  private readonly approvals = new Map<string, ApprovalRecord>();

  private readonly taskQueue = new KeyedSerialQueue();
  private readonly approvalQueue = new KeyedSerialQueue();
  private readonly taskCreateQueue = new SerialQueue();
  private readonly approvalCreateQueue = new SerialQueue();

  async create(
    params: Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<TaskRunRecord> {
    return this.taskCreateQueue.run(async () => {
      const now = new Date().toISOString();
      const safeParams = this.cloneCreateTaskParams(params);

      const record: TaskRunRecord = {
        ...safeParams,
        id: nanoid(),
        createdAt: now,
        updatedAt: now,
      };

      this.tasks.set(record.id, this.cloneTaskRecord(record));
      return this.cloneTaskRecord(record);
    });
  }

  async get(taskId: string): Promise<TaskRunRecord | undefined> {
    const record = this.tasks.get(taskId);
    return record ? this.cloneTaskRecord(record) : undefined;
  }

  async list(params?: { limit?: number }): Promise<TaskRunRecord[]> {
    const limit = params?.limit ?? 50;

    return [...this.tasks.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((record) => this.cloneTaskRecord(record));
  }

  async update(
    taskId: string,
    updater: (current: TaskRunRecord) => TaskRunRecord,
  ): Promise<TaskRunRecord> {
    return this.taskQueue.run(taskId, async () => {
      const current = this.tasks.get(taskId);
      if (!current) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const safeCurrent = this.cloneTaskRecord(current);
      const next = updater(safeCurrent);

      const normalized: TaskRunRecord = {
        ...this.cloneTaskRecord(next),
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };

      this.tasks.set(taskId, this.cloneTaskRecord(normalized));
      return this.cloneTaskRecord(normalized);
    });
  }

  async appendLog(taskId: string, message: string): Promise<void> {
    await this.taskQueue.run(taskId, async () => {
      const current = this.tasks.get(taskId);
      if (!current) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const updated: TaskRunRecord = {
        ...this.cloneTaskRecord(current),
        logs: [...current.logs, `${new Date().toISOString()} ${redactText(message)}`],
        updatedAt: new Date().toISOString(),
      };

      this.tasks.set(taskId, this.cloneTaskRecord(updated));
    });
  }

  async upsertStep(taskId: string, step: TaskStepResult): Promise<void> {
    await this.taskQueue.run(taskId, async () => {
      const current = this.tasks.get(taskId);
      if (!current) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const nextStep = this.cloneStep(step);
      const steps = current.steps.map((item) => this.cloneStep(item));
      const index = steps.findIndex((item) => item.stepId === nextStep.stepId);

      if (index >= 0) {
        steps[index] = this.mergeStepResults(steps[index], nextStep);
      } else {
        steps.push(nextStep);
      }

      const updated: TaskRunRecord = {
        ...this.cloneTaskRecord(current),
        steps,
        updatedAt: new Date().toISOString(),
      };

      this.tasks.set(taskId, this.cloneTaskRecord(updated));
    });
  }

  async createApproval(
    params: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status">,
  ): Promise<ApprovalRecord> {
    return this.approvalCreateQueue.run(async () => {
      const now = new Date().toISOString();
      const safeParams = this.cloneCreateApprovalParams(params);

      const record: ApprovalRecord = {
        ...safeParams,
        id: nanoid(),
        createdAt: now,
        updatedAt: now,
        status: "pending",
      };

      this.approvals.set(record.id, this.cloneApprovalRecord(record));
      return this.cloneApprovalRecord(record);
    });
  }

  async getApproval(approvalId: string): Promise<ApprovalRecord | undefined> {
    const record = this.approvals.get(approvalId);
    return record ? this.cloneApprovalRecord(record) : undefined;
  }

  async getPendingApproval(
    taskId: string,
    stepId: string,
  ): Promise<ApprovalRecord | undefined> {
    const found = [...this.approvals.values()].find(
      (item) =>
        item.taskId === taskId &&
        item.stepId === stepId &&
        item.status === "pending",
    );

    return found ? this.cloneApprovalRecord(found) : undefined;
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    return [...this.approvals.values()]
      .filter((item) => item.status === "pending")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => this.cloneApprovalRecord(item));
  }

  async decideApproval(params: {
    approvalId: string;
    status: "approved" | "rejected";
    decidedBy?: string;
    decisionNote?: string;
  }): Promise<ApprovalRecord> {
    return this.approvalQueue.run(params.approvalId, async () => {
      const current = this.approvals.get(params.approvalId);
      if (!current) {
        throw new Error(`Approval not found: ${params.approvalId}`);
      }

      const now = new Date().toISOString();
      const updated: ApprovalRecord = {
        ...this.cloneApprovalRecord(current),
        status: params.status,
        decidedBy: params.decidedBy,
        decisionNote: params.decisionNote,
        decidedAt: now,
        updatedAt: now,
      };

      this.approvals.set(params.approvalId, this.cloneApprovalRecord(updated));
      return this.cloneApprovalRecord(updated);
    });
  }

  async getStats(): Promise<TaskStoreStats> {
    const tasks = [...this.tasks.values()];
    const approvals = [...this.approvals.values()];

    return {
      queued: tasks.filter((item) => item.status === "queued").length,
      running: tasks.filter((item) => item.status === "running").length,
      success: tasks.filter((item) => item.status === "success").length,
      failed: tasks.filter((item) => item.status === "failed").length,
      awaitingApproval: tasks.filter(
        (item) => item.status === "awaiting_approval",
      ).length,
      rejected: tasks.filter((item) => item.status === "rejected").length,
      approvalsPending: approvals.filter((item) => item.status === "pending")
        .length,
    };
  }

  private mergeStepResults(
    previous: TaskStepResult,
    next: TaskStepResult,
  ): TaskStepResult {
    return this.cloneStep({
      ...previous,
      ...next,
      stepId: previous.stepId,
      action: next.action ?? previous.action,
      status: next.status,
      startedAt: next.startedAt ?? previous.startedAt,
      finishedAt: next.finishedAt ?? previous.finishedAt,
      output: next.output ?? previous.output,
      error: next.error ?? previous.error,
      artifacts: next.artifacts ?? previous.artifacts,
    });
  }

  private cloneCreateTaskParams(
    params: Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt">,
  ): Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt"> {
    return {
      ...params,
      steps: Array.isArray(params.steps)
        ? params.steps.map((step) => this.cloneStep(step))
        : [],
      logs: Array.isArray(params.logs) ? [...params.logs] : [],
    };
  }

  private cloneCreateApprovalParams(
    params: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status">,
  ): Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status"> {
    return {
      ...params,
      input: this.cloneJsonRecord(params.input),
    };
  }

  private cloneTaskRecord(record: TaskRunRecord): TaskRunRecord {
    return {
      ...record,
      steps: Array.isArray(record.steps)
        ? record.steps.map((step) => this.cloneStep(step))
        : [],
      logs: Array.isArray(record.logs) ? [...record.logs] : [],
    };
  }

  private cloneApprovalRecord(record: ApprovalRecord): ApprovalRecord {
    return {
      ...record,
      input: this.cloneJsonRecord(record.input),
    };
  }

  private cloneStep(step: TaskStepResult): TaskStepResult {
    return {
      ...step,
      artifacts: step.artifacts ? [...step.artifacts] : undefined,
      output:
        step.output === undefined
          ? undefined
          : this.deepClone(step.output),
    };
  }

  private cloneJsonRecord<T extends Record<string, unknown>>(value: T): T {
    return this.deepClone(value);
  }

  private deepClone<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== "object") {
      return value;
    }

    return redactJson(JSON.parse(JSON.stringify(value)) as T);
  }
}
