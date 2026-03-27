import type { NormalizedTaskDefinition } from "./task.js";

export interface EnqueuePayload {
  taskId: string;
  task: NormalizedTaskDefinition;
}

export interface TaskQueue {
  readonly mode: "inline" | "bullmq";
  enqueue(payload: EnqueuePayload): Promise<void>;
  startWorker(): Promise<void>;
}
