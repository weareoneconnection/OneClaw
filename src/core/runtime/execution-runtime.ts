import { buildStepResult } from "../result/result-builder.js";
import { TaskGraph } from "../task-graph/task-graph.js";
import type { CapabilityRegistry } from "../../registry/capability-registry.js";
import type { WorkerRegistry } from "../../registry/worker-registry.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
import type { TaskStore } from "../../state/task-store.js";
import type { NormalizedTaskDefinition, TaskRunRecord, TaskStepResult } from "../../types/task.js";
import type { SessionManager } from "../../state/session-manager.js";

export class ExecutionRuntime {
  constructor(
    private readonly capabilities: CapabilityRegistry,
    private readonly workers: WorkerRegistry,
    private readonly policy: PolicyEngine,
    private readonly taskStore: TaskStore,
    private readonly sessionManager: SessionManager,
  ) {}

  async runTask(taskId: string, task: NormalizedTaskDefinition): Promise<TaskRunRecord> {
    await this.taskStore.update(taskId, (current) => ({
      ...current,
      status: current.status === "awaiting_approval" ? "running" : current.status === "queued" ? "running" : current.status,
    }));
    const graph = new TaskGraph(task);
    const ordered = graph.topoOrder();

    try {
      for (const step of ordered) {
        const currentTask = await this.taskStore.get(taskId);
        if (!currentTask) throw new Error(`Task not found: ${taskId}`);
        const existing = currentTask.steps.find((item) => item.stepId === step.id);

        if (existing?.status === "success" || existing?.status === "skipped") continue;
        if (existing?.status === "rejected") {
          await this.taskStore.update(taskId, (record) => ({ ...record, status: "rejected" }));
          return (await this.taskStore.get(taskId))!;
        }

        const capability = this.capabilities.get(step.action);
        if (!capability) {
          await this.failStep(taskId, step.id, step.action, `Unknown action: ${step.action}`);
          return (await this.taskStore.get(taskId))!;
        }

        const policyDecision = this.policy.isAllowed(capability, task.approvalMode);
        if (!policyDecision.allowed) {
          await this.failStep(taskId, step.id, step.action, policyDecision.reason ?? "Blocked by policy");
          return (await this.taskStore.get(taskId))!;
        }

        if (policyDecision.requiresApproval) {
          const pending = await this.taskStore.getPendingApproval(taskId, step.id);
          if (!pending) {
            await this.taskStore.createApproval({
              taskId,
              stepId: step.id,
              action: step.action,
              reason: policyDecision.reason ?? `Approval required for ${step.action}`,
              input: step.input,
            });
            await this.taskStore.upsertStep(taskId, buildStepResult({
              stepId: step.id,
              action: step.action,
              status: "awaiting_approval",
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              error: policyDecision.reason,
            }));
            await this.taskStore.update(taskId, (record) => ({ ...record, status: "awaiting_approval" }));
            return (await this.taskStore.get(taskId))!;
          }

          if (pending.status === "pending") {
            await this.taskStore.update(taskId, (record) => ({ ...record, status: "awaiting_approval" }));
            return (await this.taskStore.get(taskId))!;
          }

          if (pending.status === "rejected") {
            await this.taskStore.upsertStep(taskId, buildStepResult({
              stepId: step.id,
              action: step.action,
              status: "rejected",
              startedAt: existing?.startedAt ?? new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              error: pending.decisionNote ?? pending.reason,
            }));
            await this.taskStore.update(taskId, (record) => ({ ...record, status: "rejected" }));
            return (await this.taskStore.get(taskId))!;
          }
        }

        const startedAt = existing?.startedAt ?? new Date().toISOString();
        await this.taskStore.upsertStep(taskId, buildStepResult({
          stepId: step.id,
          action: step.action,
          status: "running",
          startedAt,
        }));

        const worker = this.workers.get(capability.workerName);
        if (!worker) {
          await this.failStep(taskId, step.id, step.action, `Worker not found: ${capability.workerName}`);
          return (await this.taskStore.get(taskId))!;
        }

        const result = await worker.execute(step.input, {
          taskId,
          stepId: step.id,
          action: step.action,
          log: (message: string) => this.taskStore.appendLog(taskId, `[${step.id}] ${message}`),
        });

        if (!result.ok) {
          await this.taskStore.upsertStep(taskId, buildStepResult({
            stepId: step.id,
            action: step.action,
            status: "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
            error: result.error ?? "Unknown worker error",
            artifacts: result.artifacts,
          }));
          await this.taskStore.update(taskId, (current) => ({ ...current, status: "failed" }));
          return (await this.taskStore.get(taskId))!;
        }

        await this.taskStore.upsertStep(taskId, buildStepResult({
          stepId: step.id,
          action: step.action,
          status: "success",
          startedAt,
          finishedAt: new Date().toISOString(),
          output: result.output,
          artifacts: result.artifacts,
        }));
      }

      await this.taskStore.update(taskId, (current) => ({ ...current, status: "success" }));
      return (await this.taskStore.get(taskId))!;
    } finally {
      await this.sessionManager.closeTask(taskId);
    }
  }

  private async failStep(taskId: string, stepId: string, action: string, error: string): Promise<void> {
    const task = await this.taskStore.get(taskId);
    const existing: TaskStepResult | undefined = task?.steps.find((item) => item.stepId === stepId);
    await this.taskStore.upsertStep(taskId, buildStepResult({
      stepId,
      action,
      status: "failed",
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error,
    }));
    await this.taskStore.update(taskId, (current) => ({ ...current, status: "failed" }));
  }
}
