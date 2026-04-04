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
        console.log("[bullmq] queue initialized", {
            queueName: params.queueName,
            hasRedisUrl: Boolean(params.redisUrl),
        });
    }
    async enqueue(payload) {
        console.log("[bullmq] enqueue", {
            queueName: this.params.queueName,
            taskId: payload.taskId,
            taskName: payload.task.taskName,
            stepsCount: payload.task.steps.length,
        });
        await this.queue.add("run-task", payload, {
            removeOnComplete: 100,
            removeOnFail: 100,
        });
    }
    async startWorker() {
        console.log("[bullmq] starting worker", {
            queueName: this.params.queueName,
        });
        const worker = new Worker(this.params.queueName, async (job) => {
            console.log("[bullmq] processing job", {
                queueName: this.params.queueName,
                jobId: job.id,
                taskId: job.data.taskId,
                taskName: job.data.task.taskName,
                stepsCount: job.data.task.steps.length,
            });
            await this.params.runtime.runTask(job.data.taskId, job.data.task);
        }, {
            connection: this.connection,
        });
        worker.on("ready", () => {
            console.log("[bullmq] worker ready", {
                queueName: this.params.queueName,
            });
        });
        worker.on("active", (job) => {
            console.log("[bullmq] job active", {
                queueName: this.params.queueName,
                jobId: job.id,
                taskId: job.data.taskId,
                taskName: job.data.task.taskName,
            });
        });
        worker.on("completed", async (job) => {
            console.log("[bullmq] job completed", {
                queueName: this.params.queueName,
                jobId: job.id,
                taskId: job.data.taskId,
                taskName: job.data.task.taskName,
            });
            await this.params.taskStore.appendLog(job.data.taskId, `[bullmq] completed`);
            await this.params.taskStore.update(job.data.taskId, (current) => ({
                ...current,
                status: "success",
            }));
        });
        worker.on("failed", async (job, error) => {
            if (!job)
                return;
            const message = error instanceof Error ? error.message : "Unknown worker failure";
            console.error("[bullmq] job failed", {
                queueName: this.params.queueName,
                jobId: job.id,
                taskId: job.data.taskId,
                taskName: job.data.task.taskName,
                error: message,
            });
            await this.params.taskStore.appendLog(job.data.taskId, `[bullmq] ${message}`);
            await this.params.taskStore.update(job.data.taskId, (current) => ({
                ...current,
                status: "failed",
            }));
        });
        worker.on("error", (error) => {
            console.error("[bullmq] worker error:", error);
        });
        return;
    }
}
