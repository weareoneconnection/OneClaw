import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import type { GitHubAdapter } from "../../adapters/github/github-adapter.js";
export declare class CodeWorker implements Worker {
    private readonly github?;
    readonly name = "code_worker";
    constructor(github?: GitHubAdapter | undefined);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
