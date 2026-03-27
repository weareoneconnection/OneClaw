import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
export declare class Web3Worker implements Worker {
    readonly name = "web3_worker";
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
