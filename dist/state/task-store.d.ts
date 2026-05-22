import type { ApprovalRecord, TaskRunRecord, TaskStepResult, TaskStoreStats } from "../types/task.js";
export interface TaskStore {
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
export declare class InMemoryTaskStore implements TaskStore {
    private readonly tasks;
    private readonly approvals;
    private readonly taskQueue;
    private readonly approvalQueue;
    private readonly taskCreateQueue;
    private readonly approvalCreateQueue;
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
    private mergeStepResults;
    private cloneCreateTaskParams;
    private cloneCreateApprovalParams;
    private cloneTaskRecord;
    private cloneApprovalRecord;
    private cloneStep;
    private cloneJsonRecord;
    private deepClone;
}
