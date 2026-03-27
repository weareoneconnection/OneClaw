export class InlineTaskQueue {
    runtime;
    mode = "inline";
    constructor(runtime) {
        this.runtime = runtime;
    }
    async enqueue(payload) {
        await this.runtime.runTask(payload.taskId, payload.task);
    }
    async startWorker() {
        return;
    }
}
