import { InlineTaskQueue } from "./inline-task-queue.js";
import { BullMqTaskQueue } from "./bullmq-task-queue.js";
export async function createTaskQueue(params) {
    if (params.config.queueMode === "bullmq") {
        if (!params.config.redisUrl)
            throw new Error("REDIS_URL is required when ONECLAW_QUEUE_MODE=bullmq");
        return new BullMqTaskQueue({
            queueName: params.config.queueName,
            redisUrl: params.config.redisUrl,
            runtime: params.runtime,
            taskStore: params.taskStore,
        });
    }
    return new InlineTaskQueue(params.runtime);
}
