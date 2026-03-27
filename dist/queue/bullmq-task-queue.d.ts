import type { ExecutionRuntime } from "../core/runtime/execution-runtime.js";
import type { TaskStore } from "../state/task-store.js";
import type { EnqueuePayload, TaskQueue } from "../types/queue.js";
export declare class BullMqTaskQueue implements TaskQueue {
    private readonly params;
    readonly mode: "bullmq";
    private readonly connection;
    private readonly queue;
    constructor(params: {
        queueName: string;
        redisUrl: string;
        runtime: ExecutionRuntime;
        taskStore: TaskStore;
    });
    enqueue(payload: EnqueuePayload): Promise<void>;
    startWorker(): Promise<void>;
}
