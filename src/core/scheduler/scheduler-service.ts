import { nanoid } from "nanoid";
import type { TaskPlanner } from "../planner/task-planner.js";
import type { TaskStore } from "../../state/task-store.js";
import type { TaskQueue } from "../../types/queue.js";
import type { NormalizedTaskDefinition, TaskDefinition } from "../../types/task.js";

export type ScheduleStatus = "active" | "paused";

export type ScheduledTask = {
  id: string;
  name: string;
  intervalMs: number;
  status: ScheduleStatus;
  task: NormalizedTaskDefinition;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastTaskId?: string;
};

export class SchedulerService {
  private readonly items = new Map<string, ScheduledTask>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly deps: {
      planner: TaskPlanner;
      taskStore: TaskStore;
      queue: TaskQueue;
      defaultApprovalMode: "auto" | "manual";
    },
  ) {}

  list() {
    return [...this.items.values()];
  }

  get(id: string) {
    return this.items.get(id);
  }

  create(input: { name: string; intervalMs: number; task: TaskDefinition; paused?: boolean }) {
    const now = new Date().toISOString();
    const normalized = this.deps.planner.normalize(input.task, this.deps.defaultApprovalMode);
    const item: ScheduledTask = {
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

  updateStatus(id: string, status: ScheduleStatus) {
    const item = this.items.get(id);
    if (!item) return undefined;
    const next = { ...item, status, updatedAt: new Date().toISOString() };
    this.items.set(id, next);
    this.configureTimer(next);
    return next;
  }

  delete(id: string) {
    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    this.timers.delete(id);
    return this.items.delete(id);
  }

  async trigger(id: string) {
    const item = this.items.get(id);
    if (!item) return undefined;

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

  private configureTimer(item: ScheduledTask) {
    const existing = this.timers.get(item.id);
    if (existing) clearInterval(existing);
    this.timers.delete(item.id);
    if (item.status !== "active") return;

    const timer = setInterval(() => {
      this.trigger(item.id).catch((error) => {
        console.error("[scheduler] trigger failed", item.id, error);
      });
    }, item.intervalMs);
    timer.unref?.();
    this.timers.set(item.id, timer);
  }
}
