import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
export declare class ContentWorker implements Worker {
    readonly name = "content_worker";
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
