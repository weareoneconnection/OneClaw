import { nanoid } from "nanoid";
import { redactJson, redactText } from "../security/redact.js";
class KeyedSerialQueue {
    tails = new Map();
    async run(key, fn) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release;
        const current = new Promise((resolve) => {
            release = resolve;
        });
        this.tails.set(key, previous.then(() => current));
        await previous;
        try {
            return await fn();
        }
        finally {
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
    tail = Promise.resolve();
    async run(fn) {
        const previous = this.tail;
        let release;
        const current = new Promise((resolve) => {
            release = resolve;
        });
        this.tail = previous.then(() => current);
        await previous;
        try {
            return await fn();
        }
        finally {
            release();
        }
    }
}
export class InMemoryTaskStore {
    tasks = new Map();
    approvals = new Map();
    taskQueue = new KeyedSerialQueue();
    approvalQueue = new KeyedSerialQueue();
    taskCreateQueue = new SerialQueue();
    approvalCreateQueue = new SerialQueue();
    async create(params) {
        return this.taskCreateQueue.run(async () => {
            const now = new Date().toISOString();
            const safeParams = this.cloneCreateTaskParams(params);
            const record = {
                ...safeParams,
                id: nanoid(),
                createdAt: now,
                updatedAt: now,
            };
            this.tasks.set(record.id, this.cloneTaskRecord(record));
            return this.cloneTaskRecord(record);
        });
    }
    async get(taskId) {
        const record = this.tasks.get(taskId);
        return record ? this.cloneTaskRecord(record) : undefined;
    }
    async list(params) {
        const limit = params?.limit ?? 50;
        return [...this.tasks.values()]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit)
            .map((record) => this.cloneTaskRecord(record));
    }
    async update(taskId, updater) {
        return this.taskQueue.run(taskId, async () => {
            const current = this.tasks.get(taskId);
            if (!current) {
                throw new Error(`Task not found: ${taskId}`);
            }
            const safeCurrent = this.cloneTaskRecord(current);
            const next = updater(safeCurrent);
            const normalized = {
                ...this.cloneTaskRecord(next),
                id: current.id,
                createdAt: current.createdAt,
                updatedAt: new Date().toISOString(),
            };
            this.tasks.set(taskId, this.cloneTaskRecord(normalized));
            return this.cloneTaskRecord(normalized);
        });
    }
    async appendLog(taskId, message) {
        await this.taskQueue.run(taskId, async () => {
            const current = this.tasks.get(taskId);
            if (!current) {
                throw new Error(`Task not found: ${taskId}`);
            }
            const updated = {
                ...this.cloneTaskRecord(current),
                logs: [...current.logs, `${new Date().toISOString()} ${redactText(message)}`],
                updatedAt: new Date().toISOString(),
            };
            this.tasks.set(taskId, this.cloneTaskRecord(updated));
        });
    }
    async upsertStep(taskId, step) {
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
            }
            else {
                steps.push(nextStep);
            }
            const updated = {
                ...this.cloneTaskRecord(current),
                steps,
                updatedAt: new Date().toISOString(),
            };
            this.tasks.set(taskId, this.cloneTaskRecord(updated));
        });
    }
    async createApproval(params) {
        return this.approvalCreateQueue.run(async () => {
            const now = new Date().toISOString();
            const safeParams = this.cloneCreateApprovalParams(params);
            const record = {
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
    async getApproval(approvalId) {
        const record = this.approvals.get(approvalId);
        return record ? this.cloneApprovalRecord(record) : undefined;
    }
    async getPendingApproval(taskId, stepId) {
        const found = [...this.approvals.values()].find((item) => item.taskId === taskId &&
            item.stepId === stepId &&
            item.status === "pending");
        return found ? this.cloneApprovalRecord(found) : undefined;
    }
    async getLatestApprovalForStep(taskId, stepId) {
        const found = [...this.approvals.values()]
            .filter((item) => item.taskId === taskId && item.stepId === stepId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        return found ? this.cloneApprovalRecord(found) : undefined;
    }
    async listPendingApprovals() {
        return [...this.approvals.values()]
            .filter((item) => item.status === "pending")
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((item) => this.cloneApprovalRecord(item));
    }
    async decideApproval(params) {
        return this.approvalQueue.run(params.approvalId, async () => {
            const current = this.approvals.get(params.approvalId);
            if (!current) {
                throw new Error(`Approval not found: ${params.approvalId}`);
            }
            const now = new Date().toISOString();
            const updated = {
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
    async getStats() {
        const tasks = [...this.tasks.values()];
        const approvals = [...this.approvals.values()];
        return {
            queued: tasks.filter((item) => item.status === "queued").length,
            running: tasks.filter((item) => item.status === "running").length,
            success: tasks.filter((item) => item.status === "success").length,
            failed: tasks.filter((item) => item.status === "failed").length,
            awaitingApproval: tasks.filter((item) => item.status === "awaiting_approval").length,
            rejected: tasks.filter((item) => item.status === "rejected").length,
            approvalsPending: approvals.filter((item) => item.status === "pending")
                .length,
        };
    }
    mergeStepResults(previous, next) {
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
    cloneCreateTaskParams(params) {
        return {
            ...params,
            steps: Array.isArray(params.steps)
                ? params.steps.map((step) => this.cloneStep(step))
                : [],
            logs: Array.isArray(params.logs) ? [...params.logs] : [],
        };
    }
    cloneCreateApprovalParams(params) {
        return {
            ...params,
            input: this.cloneJsonRecord(params.input),
        };
    }
    cloneTaskRecord(record) {
        return {
            ...record,
            steps: Array.isArray(record.steps)
                ? record.steps.map((step) => this.cloneStep(step))
                : [],
            logs: Array.isArray(record.logs) ? [...record.logs] : [],
        };
    }
    cloneApprovalRecord(record) {
        return {
            ...record,
            input: this.cloneJsonRecord(record.input),
        };
    }
    cloneStep(step) {
        return {
            ...step,
            artifacts: step.artifacts ? [...step.artifacts] : undefined,
            output: step.output === undefined
                ? undefined
                : this.deepClone(step.output),
        };
    }
    cloneJsonRecord(value) {
        return this.deepClone(value);
    }
    deepClone(value) {
        if (value === null || value === undefined) {
            return value;
        }
        if (typeof value !== "object") {
            return value;
        }
        return redactJson(JSON.parse(JSON.stringify(value)));
    }
}
