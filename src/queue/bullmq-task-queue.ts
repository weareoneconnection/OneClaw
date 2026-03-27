import * as IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import type { ExecutionRuntime } from "../core/runtime/execution-runtime.js";
import type { TaskStore } from "../state/task-store.js";
import type { EnqueuePayload, TaskQueue } from "../types/queue.js";

const RedisCtor: any = (IORedis as any).default ?? IORedis;

export class BullMqTaskQueue implements TaskQueue {
  readonly mode = "bullmq" as const;
  private readonly connection: any;
  private readonly queue: Queue<EnqueuePayload>;

  constructor(
    private readonly params: {
      queueName: string;
      redisUrl: string;
      runtime: ExecutionRuntime;
      taskStore: TaskStore;
    },
  ) {
    this.connection = new RedisCtor(params.redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<EnqueuePayload>(params.queueName, {
      connection: this.connection,
    });
  }

  async enqueue(payload: EnqueuePayload): Promise<void> {
    await this.queue.add("run-task", payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  async startWorker(): Promise<void> {
  const worker = new Worker<EnqueuePayload>(
    this.params.queueName,
    async (job) => {
      await this.params.runtime.runTask(job.data.taskId, job.data.task);
    },
    {
      connection: this.connection,
    },
  );

  worker.on("failed", async (job, error) => {
    if (!job) return;

    const message =
      error instanceof Error ? error.message : "Unknown worker failure";

    await this.params.taskStore.appendLog(
      job.data.taskId,
      `[bullmq] ${message}`,
    );

    await this.params.taskStore.update(job.data.taskId, (current) => ({
      ...current,
      status: "failed",
    }));
  });

  worker.on("error", (error) => {
    console.error("[bullmq] worker error:", error);
  });

  worker.on("ready", () => {
    console.log("[bullmq] worker ready");
  });

  // 不要阻塞
  return;
}
}
