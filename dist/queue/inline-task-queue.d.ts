import type { ExecutionRuntime } from "../core/runtime/execution-runtime.js";
import type { EnqueuePayload, TaskQueue } from "../types/queue.js";
export declare class InlineTaskQueue implements TaskQueue {
    private readonly runtime;
    readonly mode: "inline";
    constructor(runtime: ExecutionRuntime);
    enqueue(payload: EnqueuePayload): Promise<void>;
    startWorker(): Promise<void>;
}
