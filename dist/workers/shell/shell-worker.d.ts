import type { AppConfig } from "../../config.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
export declare class ShellWorker implements Worker {
    private readonly config;
    readonly name = "shell_worker";
    constructor(config: AppConfig);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
