export declare function buildExecutionReceipt(input: {
    taskId: string;
    stepId: string;
    action: string;
    status: "success" | "failed";
    startedAt?: string;
    finishedAt?: string;
    result?: {
        artifacts?: unknown[];
        error?: string;
    };
}): {
    id: string;
    provider: string;
    action: string;
    status: "success" | "failed";
    taskId: string;
    stepId: string;
    startedAt: string | null;
    finishedAt: string;
    artifacts: string[];
    error: string | null;
};
