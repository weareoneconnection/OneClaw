import type { AppConfig } from "../../config.js";
import { HttpAdapter } from "../../adapters/http/http-adapter.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
export declare class SearchWorker implements Worker {
    private readonly config;
    private readonly httpAdapter;
    readonly name = "search_worker";
    constructor(config: AppConfig, httpAdapter: HttpAdapter);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
