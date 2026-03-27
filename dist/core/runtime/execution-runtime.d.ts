import type { CapabilityRegistry } from "../../registry/capability-registry.js";
import type { WorkerRegistry } from "../../registry/worker-registry.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
import type { TaskStore } from "../../state/task-store.js";
import type { NormalizedTaskDefinition, TaskRunRecord } from "../../types/task.js";
import type { SessionManager } from "../../state/session-manager.js";
export declare class ExecutionRuntime {
    private readonly capabilities;
    private readonly workers;
    private readonly policy;
    private readonly taskStore;
    private readonly sessionManager;
    constructor(capabilities: CapabilityRegistry, workers: WorkerRegistry, policy: PolicyEngine, taskStore: TaskStore, sessionManager: SessionManager);
    runTask(taskId: string, task: NormalizedTaskDefinition): Promise<TaskRunRecord>;
    private failStep;
}
