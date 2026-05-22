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
export declare class SchedulerService {
    private readonly deps;
    private readonly items;
    private readonly timers;
    constructor(deps: {
        planner: TaskPlanner;
        taskStore: TaskStore;
        queue: TaskQueue;
        defaultApprovalMode: "auto" | "manual";
    });
    list(): ScheduledTask[];
    get(id: string): ScheduledTask | undefined;
    create(input: {
        name: string;
        intervalMs: number;
        task: TaskDefinition;
        paused?: boolean;
    }): ScheduledTask;
    updateStatus(id: string, status: ScheduleStatus): {
        status: ScheduleStatus;
        updatedAt: string;
        id: string;
        name: string;
        intervalMs: number;
        task: NormalizedTaskDefinition;
        createdAt: string;
        lastRunAt?: string;
        lastTaskId?: string;
    } | undefined;
    delete(id: string): boolean;
    trigger(id: string): Promise<{
        lastRunAt: string;
        lastTaskId: string;
        updatedAt: string;
        id: string;
        name: string;
        intervalMs: number;
        status: ScheduleStatus;
        task: NormalizedTaskDefinition;
        createdAt: string;
    } | undefined>;
    private configureTimer;
}
