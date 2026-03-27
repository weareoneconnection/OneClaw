import type { AppConfig } from "../config.js";
import type { TaskPlanner } from "../core/planner/task-planner.js";
import type { ExecutionRuntime } from "../core/runtime/execution-runtime.js";
import type { TaskStore } from "../state/task-store.js";
import type { TaskQueue } from "../types/queue.js";
import { InlineTaskQueue } from "./inline-task-queue.js";
import { BullMqTaskQueue } from "./bullmq-task-queue.js";

export async function createTaskQueue(params: {
  config: AppConfig;
  planner: TaskPlanner;
  runtime: ExecutionRuntime;
  taskStore: TaskStore;
}): Promise<TaskQueue> {
  if (params.config.queueMode === "bullmq") {
    if (!params.config.redisUrl) throw new Error("REDIS_URL is required when ONECLAW_QUEUE_MODE=bullmq");
    return new BullMqTaskQueue({
      queueName: params.config.queueName,
      redisUrl: params.config.redisUrl,
      runtime: params.runtime,
      taskStore: params.taskStore,
    });
  }

  return new InlineTaskQueue(params.runtime);
}
