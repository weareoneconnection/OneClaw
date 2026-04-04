import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { XAdapter } from "../../adapters/x/x-adapter.js";
export declare class XReaderWorker implements Worker {
    private readonly xAdapter;
    readonly name = "x_reader_worker";
    constructor(xAdapter: XAdapter);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
