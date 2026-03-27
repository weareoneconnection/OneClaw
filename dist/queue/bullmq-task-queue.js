import * as IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
const RedisCtor = IORedis.default ?? IORedis;
export class BullMqTaskQueue {
    params;
    mode = "bullmq";
    connection;
    queue;
    constructor(params) {
        this.params = params;
        this.connection = new RedisCtor(params.redisUrl, {
            maxRetriesPerRequest: null,
        });
        this.queue = new Queue(params.queueName, {
            connection: this.connection,
        });
    }
    async enqueue(payload) {
        await this.queue.add("run-task", payload, {
            removeOnComplete: 100,
            removeOnFail: 100,
        });
    }
    async startWorker() {
        const worker = new Worker(this.params.queueName, async (job) => {
            await this.params.runtime.runTask(job.data.taskId, job.data.task);
        }, {
            connection: this.connection,
        });
        worker.on("failed", async (job, error) => {
            if (!job)
                return;
            const message = error instanceof Error ? error.message : "Unknown worker failure";
            await this.params.taskStore.appendLog(job.data.taskId, `[bullmq] ${message}`);
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
