import { buildStepResult } from "../result/result-builder.js";
import { TaskGraph } from "../task-graph/task-graph.js";
export class ExecutionRuntime {
    capabilities;
    workers;
    policy;
    taskStore;
    sessionManager;
    options = {
        defaultTimeoutMs: 60_000,
        defaultRetry: {
            maxAttempts: 2,
            backoffMs: 500,
        },
        maxParallelSteps: 2,
    };
    constructor(capabilities, workers, policy, taskStore, sessionManager) {
        this.capabilities = capabilities;
        this.workers = workers;
        this.policy = policy;
        this.taskStore = taskStore;
        this.sessionManager = sessionManager;
    }
    async runTask(taskId, task) {
        await this.taskStore.update(taskId, (current) => ({
            ...current,
            status: current.status === "queued" || current.status === "awaiting_approval"
                ? "running"
                : current.status,
        }));
        const graph = new TaskGraph(task);
        try {
            const completed = new Set();
            const failed = new Set();
            const skipped = new Set();
            const pendingApproval = new Set();
            const running = new Set();
            while (completed.size +
                failed.size +
                skipped.size +
                pendingApproval.size <
                graph.size) {
                const latestTask = await this.taskStore.get(taskId);
                if (!latestTask) {
                    throw new Error(`Task not found: ${taskId}`);
                }
                this.restoreStepStateFromRecord(latestTask, completed, failed, skipped, pendingApproval);
                if (latestTask.status === "failed" ||
                    latestTask.status === "rejected" ||
                    latestTask.status === "awaiting_approval") {
                    return latestTask;
                }
                const runnable = graph.getRunnableSteps(completed, running).filter((step) => {
                    if (failed.has(step.id))
                        return false;
                    if (skipped.has(step.id))
                        return false;
                    if (pendingApproval.has(step.id))
                        return false;
                    return true;
                });
                if (runnable.length === 0) {
                    const blockedSteps = graph.getBlockedSteps(completed, failed, running);
                    if (blockedSteps.length > 0) {
                        await this.taskStore.appendLog(taskId, `[runtime] blocked steps detected: ${blockedSteps
                            .map((step) => String(step.id))
                            .join(", ")}`);
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
                    const accountedFor = completed.size +
                        failed.size +
                        skipped.size +
                        pendingApproval.size;
                    if (accountedFor < graph.size) {
                        await this.taskStore.appendLog(taskId, `[runtime] no runnable steps but task not complete; possible deadlock or unresolved state`);
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
                const batchResults = await Promise.all(safeBatch.map(async (step) => {
                    try {
                        return await this.processStep(taskId, task, step.id, step.action, step.input);
                    }
                    finally {
                        running.delete(step.id);
                    }
                }));
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
                    if (result.decision === "failed" ||
                        result.decision === "rejected") {
                        failed.add(result.stepId);
                    }
                }
                const hasAwaitingApproval = batchResults.some((item) => item.decision === "awaiting_approval");
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
                const hasRejected = batchResults.some((item) => item.decision === "rejected");
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
                const hasFailed = batchResults.some((item) => item.decision === "failed");
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
        }
        finally {
            await this.sessionManager.closeTask(taskId);
        }
    }
    async processStep(taskId, task, stepId, action, rawInput) {
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
        const policyDecision = this.policy.isAllowed(capability, task.approvalMode);
        if (!policyDecision.allowed) {
            await this.failStep(taskId, stepId, action, policyDecision.reason ?? "Blocked by policy");
            return { stepId, decision: "failed" };
        }
        if (policyDecision.requiresApproval) {
            const approvalStatus = await this.handleApprovalRequirement(taskId, stepId, action, this.toJsonRecord(rawInput), existing?.startedAt, policyDecision.reason ?? `Approval required for ${action}`);
            if (approvalStatus === "awaiting_approval") {
                return { stepId, decision: "awaiting_approval" };
            }
            if (approvalStatus === "rejected") {
                return { stepId, decision: "rejected" };
            }
        }
        const startedAt = existing?.startedAt ?? new Date().toISOString();
        await this.taskStore.upsertStep(taskId, buildStepResult({
            stepId,
            action,
            status: "running",
            startedAt,
        }));
        const worker = this.workers.get(capability.workerName);
        if (!worker) {
            await this.failStep(taskId, stepId, action, `Worker not found: ${capability.workerName}`);
            return { stepId, decision: "failed" };
        }
        const retryPolicy = this.getRetryPolicy(action);
        const timeoutMs = this.getTimeoutMs(action);
        const result = await this.executeWorkerWithRetry(taskId, stepId, action, worker, this.toJsonRecord(rawInput), retryPolicy, timeoutMs);
        if (!result.ok) {
            await this.taskStore.upsertStep(taskId, buildStepResult({
                stepId,
                action,
                status: "failed",
                startedAt,
                finishedAt: new Date().toISOString(),
                error: result.error ?? "Unknown worker error",
                artifacts: result.artifacts,
            }));
            return { stepId, decision: "failed" };
        }
        await this.taskStore.upsertStep(taskId, buildStepResult({
            stepId,
            action,
            status: "success",
            startedAt,
            finishedAt: new Date().toISOString(),
            output: result.output,
            artifacts: result.artifacts,
        }));
        return { stepId, decision: "completed" };
    }
    async handleApprovalRequirement(taskId, stepId, action, input, existingStartedAt, reason) {
        const pending = await this.taskStore.getPendingApproval(taskId, stepId);
        if (!pending) {
            await this.taskStore.createApproval({
                taskId,
                stepId,
                action,
                reason,
                input,
            });
            await this.taskStore.upsertStep(taskId, buildStepResult({
                stepId,
                action,
                status: "awaiting_approval",
                startedAt: existingStartedAt ?? new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                error: reason,
            }));
            return "awaiting_approval";
        }
        if (pending.status === "pending") {
            await this.taskStore.upsertStep(taskId, buildStepResult({
                stepId,
                action,
                status: "awaiting_approval",
                startedAt: existingStartedAt ?? new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                error: pending.reason ?? reason,
            }));
            return "awaiting_approval";
        }
        if (pending.status === "rejected") {
            await this.taskStore.upsertStep(taskId, buildStepResult({
                stepId,
                action,
                status: "rejected",
                startedAt: existingStartedAt ?? new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                error: pending.decisionNote ?? pending.reason ?? reason,
            }));
            return "rejected";
        }
        return "approved";
    }
    async executeWorkerWithRetry(taskId, stepId, action, worker, input, retryPolicy, timeoutMs) {
        let lastError = "Unknown worker error";
        let lastArtifacts;
        const maxAttempts = Math.max(1, retryPolicy.maxAttempts);
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            await this.taskStore.appendLog(taskId, `[${stepId}] attempt ${attempt}/${maxAttempts} for ${action}`);
            const result = await this.executeWorkerWithTimeout(taskId, stepId, action, worker, input, timeoutMs);
            if (result.ok) {
                return result;
            }
            lastError = result.error ?? lastError;
            lastArtifacts = result.artifacts;
            await this.taskStore.appendLog(taskId, `[${stepId}] attempt ${attempt} failed: ${lastError}`);
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
    async executeWorkerWithTimeout(taskId, stepId, action, worker, input, timeoutMs) {
        try {
            const result = await this.withTimeout(worker.execute(input, {
                taskId,
                stepId,
                action,
                log: async (message) => {
                    await this.taskStore.appendLog(taskId, `[${stepId}] ${message}`);
                },
            }), timeoutMs, `Step ${stepId} timed out after ${timeoutMs}ms`);
            return {
                ok: result.ok,
                output: this.toJsonValue(result.output),
                artifacts: this.toStringArray(result.artifacts),
                error: result.error,
            };
        }
        catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown worker error",
            };
        }
    }
    async failStep(taskId, stepId, action, error) {
        const task = await this.taskStore.get(taskId);
        const existing = task?.steps.find((item) => item.stepId === stepId);
        await this.taskStore.upsertStep(taskId, buildStepResult({
            stepId,
            action,
            status: "failed",
            startedAt: existing?.startedAt ?? new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            error,
        }));
    }
    restoreStepStateFromRecord(task, completed, failed, skipped, pendingApproval) {
        completed.clear();
        failed.clear();
        skipped.clear();
        pendingApproval.clear();
        for (const step of task.steps) {
            if (step.status === "success") {
                completed.add(step.stepId);
            }
            else if (step.status === "failed" || step.status === "rejected") {
                failed.add(step.stepId);
            }
            else if (step.status === "skipped") {
                skipped.add(step.stepId);
            }
            else if (step.status === "awaiting_approval") {
                pendingApproval.add(step.stepId);
            }
        }
    }
    selectSafeParallelBatch(steps) {
        const batch = [];
        const claimedKeys = new Set();
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
    getStepResourceKeys(action, input) {
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
    getRetryPolicy(_action) {
        return this.options.defaultRetry;
    }
    getTimeoutMs(_action) {
        return this.options.defaultTimeoutMs;
    }
    async withTimeout(promise, timeoutMs, message) {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        reject(new Error(message));
                    }, timeoutMs);
                }),
            ]);
        }
        finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }
    async delay(ms) {
        await new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
    toStringArray(value) {
        if (!Array.isArray(value))
            return undefined;
        return value.map((item) => String(item));
    }
    toJsonRecord(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = this.toJsonValue(item) ?? null;
        }
        return out;
    }
    toJsonValue(value) {
        if (value === undefined)
            return undefined;
        if (value === null)
            return null;
        if (typeof value === "string")
            return value;
        if (typeof value === "number")
            return Number.isFinite(value) ? value : null;
        if (typeof value === "boolean")
            return value;
        if (Array.isArray(value)) {
            return value.map((item) => this.toJsonValue(item) ?? null);
        }
        if (typeof value === "object") {
            const out = {};
            for (const [key, item] of Object.entries(value)) {
                out[key] = this.toJsonValue(item) ?? null;
            }
            return out;
        }
        return String(value);
    }
}
