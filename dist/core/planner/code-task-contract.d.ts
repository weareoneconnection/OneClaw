import type { ApprovalMode, Json, NormalizedTaskStep, TaskDefinition } from "../../types/task.js";
export declare const CODE_TASK_SCHEMA_VERSION = "theone.code_task.v1";
export declare function normalizeCodeTask(input: {
    task: TaskDefinition;
    steps: NormalizedTaskStep[];
    approvalMode: ApprovalMode;
}): {
    steps: NormalizedTaskStep[];
    approvalMode: ApprovalMode;
    metadata: Record<string, Json> | undefined;
} | {
    steps: NormalizedTaskStep[];
    approvalMode: ApprovalMode;
    metadata: {
        codeTask: {
            schemaVersion: string;
            kind: string;
            canonicalActions: string[];
            aliasRepairs: string[];
            runtime: {
                target: string;
                status: string;
            };
            sandbox: {
                id: string;
                filesystem: string;
                networkEgress: string;
                commandExecution: string;
                maxFiles: number;
                maxFileBytes: number;
                maxTotalBytes: number;
                timeoutMs: number;
                rollbackRequired: boolean;
            };
        };
    };
};
