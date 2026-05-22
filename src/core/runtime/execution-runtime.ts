import { buildStepResult } from "../result/result-builder.js";
import { buildExecutionReceipt } from "../proof/receipt.js";
import { TaskGraph } from "../task-graph/task-graph.js";
import type { PreflightEngine } from "../preflight/preflight-engine.js";
import type { AppConfig } from "../../config.js";
import type { CapabilityRegistry } from "../../registry/capability-registry.js";
import type { WorkerRegistry } from "../../registry/worker-registry.js";
import type { PolicyEngine } from "../policy/policy-engine.js";
import type { TaskStore } from "../../state/task-store.js";
import type {
  Json,
  NormalizedTaskDefinition,
  TaskRunRecord,
  TaskStepResult,
} from "../../types/task.js";
import type { SessionManager } from "../../state/session-manager.js";

type StepExecutionOutput = {
  ok: boolean;
  output?: Json | Record<string, Json>;
  artifacts?: string[];
  error?: string;
};

type RuntimeWorkerResult = {
  ok: boolean;
  output?: unknown;
  artifacts?: unknown[];
  error?: string;
};

type RuntimeWorker = {
  execute: (
    input: Record<string, Json>,
    context: {
      taskId: string;
      stepId: string;
      action: string;
      log: (message: string) => Promise<void>;
    },
  ) => Promise<RuntimeWorkerResult>;
};

type ApprovalStatus = "approved" | "awaiting_approval" | "rejected";

type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
};

type RuntimeOptions = {
  defaultTimeoutMs: number;
  defaultRetry: RetryPolicy;
  maxParallelSteps: number;
};

type StepDecision =
  | "completed"
  | "skipped"
  | "awaiting_approval"
  | "rejected"
  | "failed";

type ProcessStepResult = {
  stepId: string;
  decision: StepDecision;
};

type TemplateContext = Record<
  string,
  Record<string, Json | Record<string, Json> | undefined>
>;

export class ExecutionRuntime {
  private readonly options: RuntimeOptions = {
    defaultTimeoutMs: 60_000,
    defaultRetry: {
      maxAttempts: 2,
      backoffMs: 500,
    },
    maxParallelSteps: 2,
  };

  private readonly placeholderTexts = new Set(
    [
      "",
      "done",
      "ok",
      "success",
      "completed",
      "execution completed",
      "execution completed successfully",
      "execution completed successfully.",
      "planning task",
      "planning task...",
      "result",
      "summary",
      "final result",
    ].map((item) => item.toLowerCase()),
  );

  constructor(
    private readonly capabilities: CapabilityRegistry,
    private readonly workers: WorkerRegistry,
    private readonly policy: PolicyEngine,
    private readonly taskStore: TaskStore,
    private readonly sessionManager: SessionManager,
    private readonly preflight?: PreflightEngine,
    private readonly config?: AppConfig,
  ) {}

  async runTask(
    taskId: string,
    task: NormalizedTaskDefinition,
  ): Promise<TaskRunRecord> {
    await this.taskStore.update(taskId, (current) => ({
      ...current,
      status:
        current.status === "queued" || current.status === "awaiting_approval"
          ? "running"
          : current.status,
    }));

    const graph = new TaskGraph(task);

    try {
      const completed = new Set<string>();
      const failed = new Set<string>();
      const skipped = new Set<string>();
      const pendingApproval = new Set<string>();
      const running = new Set<string>();

      while (
        completed.size +
          failed.size +
          skipped.size +
          pendingApproval.size <
        graph.size
      ) {
        const latestTask = await this.taskStore.get(taskId);
        if (!latestTask) {
          throw new Error(`Task not found: ${taskId}`);
        }

        this.restoreStepStateFromRecord(
          latestTask,
          completed,
          failed,
          skipped,
          pendingApproval,
        );

        if (
          latestTask.status === "failed" ||
          latestTask.status === "rejected" ||
          latestTask.status === "awaiting_approval"
        ) {
          return latestTask;
        }

        const runnable = graph.getRunnableSteps(completed, running).filter((step) => {
          if (failed.has(step.id)) return false;
          if (skipped.has(step.id)) return false;
          if (pendingApproval.has(step.id)) return false;
          return true;
        });

        if (runnable.length === 0) {
          const blockedSteps = graph.getBlockedSteps(
            completed,
            failed,
            running,
          );

          if (blockedSteps.length > 0) {
            await this.taskStore.appendLog(
              taskId,
              `[runtime] blocked steps detected: ${blockedSteps
                .map((step) => String(step.id))
                .join(", ")}`,
            );

            await this.taskStore.update(taskId, (current) => ({
              ...current,
              status: "failed",
            }));

            const failedTask = await this.taskStore.get(taskId);
            if (!failedTask) {
              throw new Error(`Task not found after blocked failure: ${taskId}`);
            }
            return failedTask;
          }

          const accountedFor =
            completed.size +
            failed.size +
            skipped.size +
            pendingApproval.size;

          if (accountedFor < graph.size) {
            await this.taskStore.appendLog(
              taskId,
              `[runtime] no runnable steps but task not complete; possible deadlock or unresolved state`,
            );

            await this.taskStore.update(taskId, (current) => ({
              ...current,
              status: "failed",
            }));

            const failedTask = await this.taskStore.get(taskId);
            if (!failedTask) {
              throw new Error(`Task not found after deadlock: ${taskId}`);
            }
            return failedTask;
          }

          break;
        }

        const safeBatch = this.selectSafeParallelBatch(runnable);

        for (const step of safeBatch) {
          running.add(step.id);
        }

        const batchResults = await Promise.all(
          safeBatch.map(async (step) => {
            try {
              return await this.processStep(
                taskId,
                task,
                step.id,
                step.action,
                step.input,
              );
            } finally {
              running.delete(step.id);
            }
          }),
        );

        for (const result of batchResults) {
          if (result.decision === "completed") {
            completed.add(result.stepId);
            continue;
          }

          if (result.decision === "skipped") {
            skipped.add(result.stepId);
            continue;
          }

          if (result.decision === "awaiting_approval") {
            pendingApproval.add(result.stepId);
            continue;
          }

          if (
            result.decision === "failed" ||
            result.decision === "rejected"
          ) {
            failed.add(result.stepId);
          }
        }

        const hasAwaitingApproval = batchResults.some(
          (item) => item.decision === "awaiting_approval",
        );
        if (hasAwaitingApproval) {
          await this.taskStore.update(taskId, (current) => ({
            ...current,
            status: "awaiting_approval",
          }));

          const waitingTask = await this.taskStore.get(taskId);
          if (!waitingTask) {
            throw new Error(`Task not found after awaiting approval: ${taskId}`);
          }
          return waitingTask;
        }

        const hasRejected = batchResults.some(
          (item) => item.decision === "rejected",
        );
        if (hasRejected) {
          await this.taskStore.update(taskId, (current) => ({
            ...current,
            status: "rejected",
          }));

          const rejectedTask = await this.taskStore.get(taskId);
          if (!rejectedTask) {
            throw new Error(`Task not found after rejection: ${taskId}`);
          }
          return rejectedTask;
        }

        const hasFailed = batchResults.some(
          (item) => item.decision === "failed",
        );
        if (hasFailed) {
          await this.taskStore.update(taskId, (current) => ({
            ...current,
            status: "failed",
          }));

          const failedTask = await this.taskStore.get(taskId);
          if (!failedTask) {
            throw new Error(`Task not found after failure: ${taskId}`);
          }
          return failedTask;
        }
      }

      await this.taskStore.update(taskId, (current) => ({
        ...current,
        status: "success",
      }));

      const finalTask = await this.taskStore.get(taskId);
      if (!finalTask) {
        throw new Error(`Task not found after completion: ${taskId}`);
      }

      return finalTask;
    } finally {
      await this.sessionManager.closeTask(taskId);
    }
  }

  private async processStep(
    taskId: string,
    task: NormalizedTaskDefinition,
    stepId: string,
    action: string,
    rawInput: unknown,
  ): Promise<ProcessStepResult> {
    const currentTask = await this.taskStore.get(taskId);
    if (!currentTask) {
      throw new Error(`Task not found during step processing: ${taskId}`);
    }

    const existing = currentTask.steps.find((item) => item.stepId === stepId);

    if (existing?.status === "success") {
      return { stepId, decision: "completed" };
    }

    if (existing?.status === "skipped") {
      return { stepId, decision: "skipped" };
    }

    if (existing?.status === "rejected") {
      return { stepId, decision: "rejected" };
    }

    if (existing?.status === "failed") {
      return { stepId, decision: "failed" };
    }

    const capability = this.capabilities.get(action);
    if (!capability) {
      await this.failStep(taskId, stepId, action, `Unknown action: ${action}`);
      return { stepId, decision: "failed" };
    }

    const policyDecision = this.policy.isAllowed(
      capability,
      task.approvalMode,
    );

    if (!policyDecision.allowed) {
      await this.failStep(
        taskId,
        stepId,
        action,
        policyDecision.reason ?? "Blocked by policy",
      );
      return { stepId, decision: "failed" };
    }

    const resolvedInputRecord = await this.resolveInputForStep(
      taskId,
      action,
      rawInput,
    );

    const preflightReport = this.preflight?.evaluateStep(action, resolvedInputRecord, stepId);
    if (preflightReport && !preflightReport.ok) {
      const detail = preflightReport.checks
        .filter((item) => item.status === "fail")
        .map((item) => `${item.label}: ${item.detail}`)
        .join("; ");
      await this.failStep(taskId, stepId, action, `Preflight blocked action. ${detail}`);
      return { stepId, decision: "failed" };
    }

    const inputPolicyDecision = this.policy.evaluateAction({
      capability,
      approvalMode: task.approvalMode,
      actionInput: resolvedInputRecord,
      limits: {
        maxAutoPaymentAmount: this.config?.maxAutoPaymentAmount,
        maxAutoDatabaseWriteRows: this.config?.maxAutoDatabaseWriteRows,
      },
    });

    if (!inputPolicyDecision.allowed) {
      await this.failStep(taskId, stepId, action, inputPolicyDecision.reason ?? "Blocked by input policy");
      return { stepId, decision: "failed" };
    }

    if (policyDecision.requiresApproval || inputPolicyDecision.requiresApproval) {
      const approvalStatus = await this.handleApprovalRequirement(
        taskId,
        stepId,
        action,
        resolvedInputRecord,
        existing?.startedAt,
        inputPolicyDecision.reason ?? policyDecision.reason ?? `Approval required for ${action}`,
      );

      if (approvalStatus === "awaiting_approval") {
        return { stepId, decision: "awaiting_approval" };
      }

      if (approvalStatus === "rejected") {
        return { stepId, decision: "rejected" };
      }
    }

    const startedAt = existing?.startedAt ?? new Date().toISOString();

    await this.taskStore.upsertStep(
      taskId,
      buildStepResult({
        stepId,
        action,
        status: "running",
        startedAt,
      }),
    );

    const worker = this.workers.get(capability.workerName) as
      | RuntimeWorker
      | undefined;

    if (!worker) {
      await this.failStep(
        taskId,
        stepId,
        action,
        `Worker not found: ${capability.workerName}`,
      );
      return { stepId, decision: "failed" };
    }

    const retryPolicy = this.getRetryPolicy(action);
    const timeoutMs = this.getTimeoutMs(action);

    const result = await this.executeWorkerWithRetry(
      taskId,
      stepId,
      action,
      worker,
      resolvedInputRecord,
      retryPolicy,
      timeoutMs,
    );

    if (!result.ok) {
      await this.taskStore.upsertStep(
        taskId,
        buildStepResult({
          stepId,
          action,
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          error: result.error ?? "Unknown worker error",
          artifacts: result.artifacts,
          output: {
            receipt: buildExecutionReceipt({
              taskId,
              stepId,
              action,
              status: "failed",
              startedAt,
              result,
            }),
          },
        }),
      );

      return { stepId, decision: "failed" };
    }

    await this.taskStore.upsertStep(
      taskId,
      buildStepResult({
        stepId,
        action,
        status: "success",
        startedAt,
        finishedAt: new Date().toISOString(),
        output: {
          ...(this.asRecord(result.output) ?? {}),
          receipt: buildExecutionReceipt({
            taskId,
            stepId,
            action,
            status: "success",
            startedAt,
            result,
          }),
        },
        artifacts: result.artifacts,
      }),
    );

    return { stepId, decision: "completed" };
  }

  private async resolveInputForStep(
    taskId: string,
    action: string,
    rawInput: unknown,
  ): Promise<Record<string, Json>> {
    const context = await this.buildTemplateContext(taskId);
    const resolved = this.resolveTemplates(rawInput, context);
    const record = this.toJsonRecord(resolved);
    return this.enrichFinalInputIfNeeded(taskId, action, record);
  }

  private async buildTemplateContext(taskId: string): Promise<TemplateContext> {
    const task = await this.taskStore.get(taskId);
    if (!task) {
      throw new Error(`Task not found during template resolution: ${taskId}`);
    }

    const context: TemplateContext = {};

    for (const step of task.steps) {
      const outputRecord = this.asRecord(step.output);

      context[step.stepId] = {
        output: step.output,
        error: step.error ?? undefined,
        status: step.status,
        artifacts: Array.isArray(step.artifacts)
          ? (step.artifacts.map((item) => String(item)) as unknown as Json)
          : undefined,

        // aliases for easier templating
        text:
          this.pickFirstString(
            outputRecord?.text,
            outputRecord?.content,
            outputRecord?.body,
          ) ?? undefined,
        content:
          this.pickFirstString(
            outputRecord?.content,
            outputRecord?.text,
            outputRecord?.body,
          ) ?? undefined,
        title: this.asStringOrUndefined(outputRecord?.title),
        url: this.asStringOrUndefined(outputRecord?.url),
        body: outputRecord?.body as Json | Record<string, Json> | undefined,
        html: outputRecord?.html as Json | Record<string, Json> | undefined,
        summary:
          this.pickFirstString(outputRecord?.summary, outputRecord?.text) ??
          undefined,
      };
    }

    return context;
  }

  private resolveTemplates(value: unknown, context: TemplateContext): unknown {
    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "string") {
      return this.resolveTemplateString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveTemplates(item, context));
    }

    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = this.resolveTemplates(item, context);
      }
      return out;
    }

    return String(value);
  }

  private resolveTemplateString(
    template: string,
    context: TemplateContext,
  ): unknown {
    const exactMatch = template.match(/^\s*\{\{\s*([^}]+)\s*\}\}\s*$/);
    if (exactMatch) {
      const resolved = this.resolveExpression(exactMatch[1], context);
      return resolved ?? "";
    }

    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expr) => {
      const resolved = this.resolveExpression(expr, context);

      if (resolved === null || resolved === undefined) {
        return "";
      }

      if (typeof resolved === "string") {
        return resolved;
      }

      if (typeof resolved === "number" || typeof resolved === "boolean") {
        return String(resolved);
      }

      return JSON.stringify(resolved);
    });
  }

  private resolveExpression(
    expression: string,
    context: TemplateContext,
  ): unknown {
    const path = expression
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);

    if (path.length === 0) {
      return undefined;
    }

    const [stepId, ...rest] = path;
    let current: unknown = context[stepId];

    if (!current) {
      return undefined;
    }

    for (const key of rest) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          return undefined;
        }
        current = current[index];
        continue;
      }

      if (typeof current === "object") {
        const record = current as Record<string, unknown>;
        current = record[key];
        continue;
      }

      return undefined;
    }

    return current;
  }

  private async enrichFinalInputIfNeeded(
    taskId: string,
    action: string,
    input: Record<string, Json>,
  ): Promise<Record<string, Json>> {
    if (action !== "message.send" && action !== "social.post") {
      return input;
    }

    const currentText =
      typeof input.text === "string" ? input.text.trim() : "";

    if (!this.shouldAutoHydrateText(currentText)) {
      return input;
    }

    const task = await this.taskStore.get(taskId);
    if (!task) {
      return input;
    }

    const fallbackText = this.buildFallbackTextFromTask(task);
    if (!fallbackText) {
      return input;
    }

    return {
      ...input,
      text: fallbackText,
    };
  }

  private shouldAutoHydrateText(text: string): boolean {
    if (!text) return true;

    const normalized = text.trim().toLowerCase();
    if (this.placeholderTexts.has(normalized)) {
      return true;
    }

    if (
      normalized === "final result" ||
      normalized === "actual summary" ||
      normalized === "summary content"
    ) {
      return true;
    }

    return false;
  }

  private buildFallbackTextFromTask(task: TaskRunRecord): string | undefined {
    const successfulSteps = [...task.steps].filter((step) => step.status === "success");

    if (successfulSteps.length === 0) {
      return undefined;
    }

    const preferredStep = [...successfulSteps]
      .reverse()
      .find((step) => {
        const output = this.asRecord(step.output);
        return Boolean(
          this.pickFirstString(
            output?.summary,
            output?.content,
            output?.text,
            output?.body,
          ),
        );
      });

    if (!preferredStep) {
      return undefined;
    }

    const output = this.asRecord(preferredStep.output);
    if (!output) {
      return undefined;
    }

    const explicitSummary = this.asStringOrUndefined(output.summary);
    if (explicitSummary) {
      return explicitSummary;
    }

    const content = this.pickFirstString(
      output.content,
      output.text,
      output.body,
    );

    const title = this.asStringOrUndefined(output.title);
    const url = this.asStringOrUndefined(output.url);

    if (!content) {
      if (title || url) {
        return [title ? `Title: ${title}` : "", url ? `URL: ${url}` : ""]
          .filter(Boolean)
          .join("\n");
      }
      return undefined;
    }

    const compact = this.compactText(content);

    if (title || url) {
      const lines: string[] = [];
      if (title) lines.push(`Title: ${title}`);
      if (url) lines.push(`URL: ${url}`);
      lines.push("");
      lines.push(compact);
      return lines.join("\n").trim();
    }

    return compact;
  }

  private compactText(input: string, maxLength = 1200): string {
    const cleaned = input
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    const sliced = cleaned.slice(0, maxLength);
    const lastBoundary = Math.max(
      sliced.lastIndexOf("\n"),
      sliced.lastIndexOf("。"),
      sliced.lastIndexOf(". "),
      sliced.lastIndexOf("! "),
      sliced.lastIndexOf("? "),
    );

    if (lastBoundary > Math.floor(maxLength * 0.5)) {
      return `${sliced.slice(0, lastBoundary).trim()}\n...`;
    }

    return `${sliced.trim()}...`;
  }

  private pickFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      const text = this.asStringOrUndefined(value);
      if (text) return text;
    }
    return undefined;
  }

  private asStringOrUndefined(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") {
      const text = value.trim();
      return text ? text : undefined;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private async handleApprovalRequirement(
    taskId: string,
    stepId: string,
    action: string,
    input: Record<string, Json>,
    existingStartedAt: string | undefined,
    reason: string,
  ): Promise<ApprovalStatus> {
    const pending = await this.taskStore.getLatestApprovalForStep(taskId, stepId);

    if (!pending) {
      await this.taskStore.createApproval({
        taskId,
        stepId,
        action,
        reason,
        input,
      });

      await this.taskStore.upsertStep(
        taskId,
        buildStepResult({
          stepId,
          action,
          status: "awaiting_approval",
          startedAt: existingStartedAt ?? new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: reason,
        }),
      );

      return "awaiting_approval";
    }

    if (pending.status === "pending") {
      await this.taskStore.upsertStep(
        taskId,
        buildStepResult({
          stepId,
          action,
          status: "awaiting_approval",
          startedAt: existingStartedAt ?? new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: pending.reason ?? reason,
        }),
      );

      return "awaiting_approval";
    }

    if (pending.status === "rejected") {
      await this.taskStore.upsertStep(
        taskId,
        buildStepResult({
          stepId,
          action,
          status: "rejected",
          startedAt: existingStartedAt ?? new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: pending.decisionNote ?? pending.reason ?? reason,
        }),
      );

      return "rejected";
    }

    return "approved";
  }

  private async executeWorkerWithRetry(
    taskId: string,
    stepId: string,
    action: string,
    worker: RuntimeWorker,
    input: Record<string, Json>,
    retryPolicy: RetryPolicy,
    timeoutMs: number,
  ): Promise<StepExecutionOutput> {
    let lastError = "Unknown worker error";
    let lastArtifacts: string[] | undefined;

    const maxAttempts = Math.max(1, retryPolicy.maxAttempts);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.taskStore.appendLog(
        taskId,
        `[${stepId}] attempt ${attempt}/${maxAttempts} for ${action}`,
      );

      const result = await this.executeWorkerWithTimeout(
        taskId,
        stepId,
        action,
        worker,
        input,
        timeoutMs,
      );

      if (result.ok) {
        return result;
      }

      lastError = result.error ?? lastError;
      lastArtifacts = result.artifacts;

      await this.taskStore.appendLog(
        taskId,
        `[${stepId}] attempt ${attempt} failed: ${lastError}`,
      );

      if (attempt < maxAttempts) {
        await this.delay(retryPolicy.backoffMs * attempt);
      }
    }

    return {
      ok: false,
      error: lastError,
      artifacts: lastArtifacts,
    };
  }

  private async executeWorkerWithTimeout(
    taskId: string,
    stepId: string,
    action: string,
    worker: RuntimeWorker,
    input: Record<string, Json>,
    timeoutMs: number,
  ): Promise<StepExecutionOutput> {
    try {
      const result = await this.withTimeout(
        worker.execute(input, {
          taskId,
          stepId,
          action,
          log: async (message: string) => {
            await this.taskStore.appendLog(taskId, `[${stepId}] ${message}`);
          },
        }),
        timeoutMs,
        `Step ${stepId} timed out after ${timeoutMs}ms`,
      );

      return {
        ok: result.ok,
        output: this.toJsonValue(result.output),
        artifacts: this.toStringArray(result.artifacts),
        error: result.error,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown worker error",
      };
    }
  }

  private async failStep(
    taskId: string,
    stepId: string,
    action: string,
    error: string,
  ): Promise<void> {
    const task = await this.taskStore.get(taskId);
    const existing: TaskStepResult | undefined = task?.steps.find(
      (item) => item.stepId === stepId,
    );

    await this.taskStore.upsertStep(
      taskId,
      buildStepResult({
        stepId,
        action,
        status: "failed",
        startedAt: existing?.startedAt ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error,
      }),
    );
  }

  private restoreStepStateFromRecord(
    task: TaskRunRecord,
    completed: Set<string>,
    failed: Set<string>,
    skipped: Set<string>,
    pendingApproval: Set<string>,
  ): void {
    completed.clear();
    failed.clear();
    skipped.clear();
    pendingApproval.clear();

    for (const step of task.steps) {
      if (step.status === "success") {
        completed.add(step.stepId);
      } else if (step.status === "failed" || step.status === "rejected") {
        failed.add(step.stepId);
      } else if (step.status === "skipped") {
        skipped.add(step.stepId);
      } else if (step.status === "awaiting_approval") {
        pendingApproval.add(step.stepId);
      }
    }
  }

  private selectSafeParallelBatch<
    T extends { id: string; action: string; input?: unknown }
  >(steps: T[]): T[] {
    const batch: T[] = [];
    const claimedKeys = new Set<string>();

    for (const step of steps) {
      if (batch.length >= this.options.maxParallelSteps) {
        break;
      }

      const resourceKeys = this.getStepResourceKeys(step.action, step.input);
      const conflicts = resourceKeys.some((key) => claimedKeys.has(key));

      if (conflicts) {
        continue;
      }

      batch.push(step);

      for (const key of resourceKeys) {
        claimedKeys.add(key);
      }
    }

    if (batch.length > 0) {
      return batch;
    }

    return steps.slice(0, 1);
  }

  private getStepResourceKeys(action: string, input: unknown): string[] {
    const keys = [`action:${action}`];
    const record = this.toJsonRecord(input);

    const maybeChatId = record.chatId ?? record.chat_id;
    if (typeof maybeChatId === "string" || typeof maybeChatId === "number") {
      keys.push(`chat:${String(maybeChatId)}`);
    }

    const maybeUserId = record.userId ?? record.user_id;
    if (typeof maybeUserId === "string" || typeof maybeUserId === "number") {
      keys.push(`user:${String(maybeUserId)}`);
    }

    return keys;
  }

  private getRetryPolicy(_action: string): RetryPolicy {
    return this.options.defaultRetry;
  }

  private getTimeoutMs(_action: string): number {
    return this.options.defaultTimeoutMs;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(message));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.map((item) => String(item));
  }

  private toJsonRecord(value: unknown): Record<string, Json> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const out: Record<string, Json> = {};

    for (const [key, item] of Object.entries(value)) {
      out[key] = this.toJsonValue(item) ?? null;
    }

    return out;
  }

  private toJsonValue(value: unknown): Json | Record<string, Json> | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;

    if (Array.isArray(value)) {
      return value.map((item) => this.toJsonValue(item) ?? null) as Json;
    }

    if (typeof value === "object") {
      const out: Record<string, Json> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = this.toJsonValue(item) ?? null;
      }
      return out;
    }

    return String(value);
  }
}
