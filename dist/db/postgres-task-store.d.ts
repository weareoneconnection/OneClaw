import { Pool } from "pg";
import type { ApprovalRecord, TaskRunRecord, TaskStepResult, TaskStoreStats } from "../types/task.js";
import type { TaskStore } from "../state/task-store.js";
export declare class PostgresTaskStore implements TaskStore {
    private readonly pool;
    constructor(pool: Pool);
    create(params: Omit<TaskRunRecord, "id" | "createdAt" | "updatedAt">): Promise<TaskRunRecord>;
    get(taskId: string): Promise<TaskRunRecord | undefined>;
    list(params?: {
        limit?: number;
    }): Promise<TaskRunRecord[]>;
    update(taskId: string, updater: (current: TaskRunRecord) => TaskRunRecord): Promise<TaskRunRecord>;
    appendLog(taskId: string, message: string): Promise<void>;
    upsertStep(taskId: string, step: TaskStepResult): Promise<void>;
    createApproval(params: Omit<ApprovalRecord, "id" | "createdAt" | "updatedAt" | "status">): Promise<ApprovalRecord>;
    getApproval(approvalId: string): Promise<ApprovalRecord | undefined>;
    getPendingApproval(taskId: string, stepId: string): Promise<ApprovalRecord | undefined>;
    getLatestApprovalForStep(taskId: string, stepId: string): Promise<ApprovalRecord | undefined>;
    listPendingApprovals(): Promise<ApprovalRecord[]>;
    decideApproval(params: {
        approvalId: string;
        status: "approved" | "rejected";
        decidedBy?: string;
        decisionNote?: string;
    }): Promise<ApprovalRecord>;
    getStats(): Promise<TaskStoreStats>;
}
