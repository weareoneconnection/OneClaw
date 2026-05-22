import { nanoid } from "nanoid";
export class SchedulerService {
    deps;
    items = new Map();
    timers = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    list() {
        return [...this.items.values()];
    }
    get(id) {
        return this.items.get(id);
    }
    create(input) {
        const now = new Date().toISOString();
        const normalized = this.deps.planner.normalize(input.task, this.deps.defaultApprovalMode);
        const item = {
            id: `sched_${nanoid(8)}`,
            name: input.name,
            intervalMs: input.intervalMs,
            status: input.paused ? "paused" : "active",
            task: normalized,
            createdAt: now,
            updatedAt: now,
        };
        this.items.set(item.id, item);
        this.configureTimer(item);
        return item;
    }
    updateStatus(id, status) {
        const item = this.items.get(id);
        if (!item)
            return undefined;
        const next = { ...item, status, updatedAt: new Date().toISOString() };
        this.items.set(id, next);
        this.configureTimer(next);
        return next;
    }
    delete(id) {
        const timer = this.timers.get(id);
        if (timer)
            clearInterval(timer);
        this.timers.delete(id);
        return this.items.delete(id);
    }
    async trigger(id) {
        const item = this.items.get(id);
        if (!item)
            return undefined;
        const record = await this.deps.taskStore.create({
            taskName: item.task.taskName,
            status: "queued",
            approvalMode: item.task.approvalMode,
            metadata: {
                ...(item.task.metadata ?? {}),
                scheduleId: item.id,
                scheduleName: item.name,
            },
            steps: [],
            logs: [],
        });
        await this.deps.queue.enqueue({ taskId: record.id, task: item.task });
        const next = {
            ...item,
            lastRunAt: new Date().toISOString(),
            lastTaskId: record.id,
            updatedAt: new Date().toISOString(),
        };
        this.items.set(id, next);
        return next;
    }
    configureTimer(item) {
        const existing = this.timers.get(item.id);
        if (existing)
            clearInterval(existing);
        this.timers.delete(item.id);
        if (item.status !== "active")
            return;
        const timer = setInterval(() => {
            this.trigger(item.id).catch((error) => {
                console.error("[scheduler] trigger failed", item.id, error);
            });
        }, item.intervalMs);
        timer.unref?.();
        this.timers.set(item.id, timer);
    }
}
