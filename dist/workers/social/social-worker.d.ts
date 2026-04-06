import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { XAdapter } from "../../adapters/x/x-adapter.js";
export declare class SocialWorker implements Worker {
    private readonly xAdapter;
    readonly name = "social_worker";
    constructor(xAdapter: XAdapter);
    private log;
    private validateMediaPaths;
    private buildSuccessOutput;
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
