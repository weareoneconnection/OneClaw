import type { ExecutionRuntime } from "../core/runtime/execution-runtime.js";
import type { EnqueuePayload, TaskQueue } from "../types/queue.js";

export class InlineTaskQueue implements TaskQueue {
  readonly mode = "inline" as const;

  constructor(private readonly runtime: ExecutionRuntime) {}

  async enqueue(payload: EnqueuePayload): Promise<void> {
    await this.runtime.runTask(payload.taskId, payload.task);
  }

  async startWorker(): Promise<void> {
    return;
  }
}
