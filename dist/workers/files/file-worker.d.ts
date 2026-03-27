import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
export declare class FileWorker implements Worker {
    readonly name = "file_worker";
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
