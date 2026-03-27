export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export type ApprovalMode = "auto" | "manual";
export type TaskStatus = "queued" | "running" | "success" | "failed" | "blocked" | "awaiting_approval" | "rejected";
export type StepStatus = "pending" | "running" | "success" | "failed" | "blocked" | "skipped" | "awaiting_approval" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export interface TaskStepDefinition {
    id: string;
    action: string;
    input?: Record<string, Json>;
    dependsOn?: string[];
    timeoutMs?: number;
    metadata?: Record<string, Json>;
}
export interface TaskDefinition {
    taskName: string;
    steps: TaskStepDefinition[];
    approvalMode?: ApprovalMode;
    metadata?: Record<string, Json>;
}
export interface NormalizedTaskStep extends TaskStepDefinition {
    dependsOn: string[];
    input: Record<string, Json>;
}
export interface NormalizedTaskDefinition extends Omit<TaskDefinition, "steps"> {
    approvalMode: ApprovalMode;
    steps: NormalizedTaskStep[];
}
export interface TaskStepResult {
    stepId: string;
    action: string;
    status: StepStatus;
    startedAt?: string;
    finishedAt?: string;
    output?: Json | Record<string, Json>;
    error?: string;
    artifacts?: string[];
}
export interface TaskRunRecord {
    id: string;
    taskName: string;
    status: TaskStatus;
    approvalMode: ApprovalMode;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, Json>;
    steps: TaskStepResult[];
    logs: string[];
}
export interface ApprovalRecord {
    id: string;
    taskId: string;
    stepId: string;
    action: string;
    status: ApprovalStatus;
    reason: string;
    input: Record<string, Json>;
    createdAt: string;
    updatedAt: string;
    decidedAt?: string;
    decidedBy?: string;
    decisionNote?: string;
}
export interface ActionExecutionRequest {
    action: string;
    input?: Record<string, Json>;
    approvalMode?: ApprovalMode;
}
export interface TaskStoreStats {
    queued: number;
    running: number;
    success: number;
    failed: number;
    awaitingApproval: number;
    rejected: number;
    approvalsPending: number;
}
