import type { Json } from "./task.js";
export interface ExecutionContext {
    taskId: string;
    stepId: string;
    action: string;
    log: (message: string) => Promise<void> | void;
}
export interface WorkerExecutionResult {
    ok: boolean;
    output?: Json | Record<string, Json>;
    error?: string;
    artifacts?: string[];
}
export interface Worker {
    readonly name: string;
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
export interface CapabilityRegistration {
    action: string;
    workerName: string;
    risk: "low" | "medium" | "high" | "critical";
    description: string;
}
