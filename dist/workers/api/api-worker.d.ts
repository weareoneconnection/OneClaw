import { HttpAdapter } from "../../adapters/http/http-adapter.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
export declare class ApiWorker implements Worker {
    private readonly httpAdapter;
    readonly name = "api_worker";
    constructor(httpAdapter: HttpAdapter);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
