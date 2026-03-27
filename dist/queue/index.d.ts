import type { AppConfig } from "../config.js";
import type { TaskPlanner } from "../core/planner/task-planner.js";
import type { ExecutionRuntime } from "../core/runtime/execution-runtime.js";
import type { TaskStore } from "../state/task-store.js";
import type { TaskQueue } from "../types/queue.js";
export declare function createTaskQueue(params: {
    config: AppConfig;
    planner: TaskPlanner;
    runtime: ExecutionRuntime;
    taskStore: TaskStore;
}): Promise<TaskQueue>;
