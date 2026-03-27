import { Pool } from "pg";
import { PolicyEngine } from "./core/policy/policy-engine.js";
import { TaskPlanner } from "./core/planner/task-planner.js";
import { ExecutionRuntime } from "./core/runtime/execution-runtime.js";
import { CapabilityRegistry } from "./registry/capability-registry.js";
import { WorkerRegistry } from "./registry/worker-registry.js";
import { InMemoryTaskStore } from "./state/task-store.js";
import { PostgresTaskStore } from "./db/postgres-task-store.js";
import { SessionManager } from "./state/session-manager.js";
import type { NormalizedTaskDefinition } from "./types/task.js";
export declare function bootstrap(options?: {
    workerOnly?: boolean;
}): Promise<{
    config: import("./config.js").AppConfig;
    taskStore: InMemoryTaskStore | PostgresTaskStore;
    sessionManager: SessionManager;
    planner: TaskPlanner;
    policy: PolicyEngine;
    capabilities: CapabilityRegistry;
    workers: WorkerRegistry;
    runtime: ExecutionRuntime;
    queue: import("./types/queue.js").TaskQueue;
    normalizedTaskStore: Map<string, NormalizedTaskDefinition>;
    pool: Pool | undefined;
}>;
export type AppServices = Awaited<ReturnType<typeof bootstrap>>;
