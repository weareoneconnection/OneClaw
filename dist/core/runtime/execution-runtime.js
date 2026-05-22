import { buildStepResult } from "../result/result-builder.js";
import { buildExecutionReceipt } from "../proof/receipt.js";
import { TaskGraph } from "../task-graph/task-graph.js";
export class ExecutionRuntime {
    capabilities;
    workers;
    policy;
    taskStore;
    sessionManager;
    preflight;
    config;
    options = {
        defaultTimeoutMs: 60_000,
        defaultRetry: {
            maxAttempts: 2,
            backoffMs: 500,
        },
        maxParallelSteps: 2,
    };
    placeholderTexts = new Set([
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
    ].map((item) => item.toLowerCase()));
    constructor(capabilities, workers, policy, taskStore, sessionManager, preflight, config) {
        this.capabilities = capabilities;
        this.workers = workers;
        this.policy = policy;
        this.taskStore = taskStore;
        this.sessionManager = sessionManager;
        this.preflight = preflight;
        this.config = config;
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
        const resolvedInputRecord = await this.resolveInputForStep(taskId, action, rawInput);
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
            const approvalStatus = await this.handleApprovalRequirement(taskId, stepId, action, resolvedInputRecord, existing?.startedAt, inputPolicyDecision.reason ?? policyDecision.reason ?? `Approval required for ${action}`);
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
        const result = await this.executeWorkerWithRetry(taskId, stepId, action, worker, resolvedInputRecord, retryPolicy, timeoutMs);
        if (!result.ok) {
            await this.taskStore.upsertStep(taskId, buildStepResult({
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
            }));
            return { stepId, decision: "failed" };
        }
        await this.taskStore.upsertStep(taskId, buildStepResult({
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
        }));
        return { stepId, decision: "completed" };
    }
    async resolveInputForStep(taskId, action, rawInput) {
        const context = await this.buildTemplateContext(taskId);
        const resolved = this.resolveTemplates(rawInput, context);
        const record = this.toJsonRecord(resolved);
        return this.enrichFinalInputIfNeeded(taskId, action, record);
    }
    async buildTemplateContext(taskId) {
        const task = await this.taskStore.get(taskId);
        if (!task) {
            throw new Error(`Task not found during template resolution: ${taskId}`);
        }
        const context = {};
        for (const step of task.steps) {
            const outputRecord = this.asRecord(step.output);
            context[step.stepId] = {
                output: step.output,
                error: step.error ?? undefined,
                status: step.status,
                artifacts: Array.isArray(step.artifacts)
                    ? step.artifacts.map((item) => String(item))
                    : undefined,
                // aliases for easier templating
                text: this.pickFirstString(outputRecord?.text, outputRecord?.content, outputRecord?.body) ?? undefined,
                content: this.pickFirstString(outputRecord?.content, outputRecord?.text, outputRecord?.body) ?? undefined,
                title: this.asStringOrUndefined(outputRecord?.title),
                url: this.asStringOrUndefined(outputRecord?.url),
                body: outputRecord?.body,
                html: outputRecord?.html,
                summary: this.pickFirstString(outputRecord?.summary, outputRecord?.text) ??
                    undefined,
            };
        }
        return context;
    }
    resolveTemplates(value, context) {
        if (value === null ||
            value === undefined ||
            typeof value === "number" ||
            typeof value === "boolean") {
            return value;
        }
        if (typeof value === "string") {
            return this.resolveTemplateString(value, context);
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.resolveTemplates(item, context));
        }
        if (typeof value === "object") {
            const out = {};
            for (const [key, item] of Object.entries(value)) {
                out[key] = this.resolveTemplates(item, context);
            }
            return out;
        }
        return String(value);
    }
    resolveTemplateString(template, context) {
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
    resolveExpression(expression, context) {
        const path = expression
            .split(".")
            .map((part) => part.trim())
            .filter(Boolean);
        if (path.length === 0) {
            return undefined;
        }
        const [stepId, ...rest] = path;
        let current = context[stepId];
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
                const record = current;
                current = record[key];
                continue;
            }
            return undefined;
        }
        return current;
    }
    async enrichFinalInputIfNeeded(taskId, action, input) {
        if (action !== "message.send" && action !== "social.post") {
            return input;
        }
        const currentText = typeof input.text === "string" ? input.text.trim() : "";
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
    shouldAutoHydrateText(text) {
        if (!text)
            return true;
        const normalized = text.trim().toLowerCase();
        if (this.placeholderTexts.has(normalized)) {
            return true;
        }
        if (normalized === "final result" ||
            normalized === "actual summary" ||
            normalized === "summary content") {
            return true;
        }
        return false;
    }
    buildFallbackTextFromTask(task) {
        const successfulSteps = [...task.steps].filter((step) => step.status === "success");
        if (successfulSteps.length === 0) {
            return undefined;
        }
        const preferredStep = [...successfulSteps]
            .reverse()
            .find((step) => {
            const output = this.asRecord(step.output);
            return Boolean(this.pickFirstString(output?.summary, output?.content, output?.text, output?.body));
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
        const content = this.pickFirstString(output.content, output.text, output.body);
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
            const lines = [];
            if (title)
                lines.push(`Title: ${title}`);
            if (url)
                lines.push(`URL: ${url}`);
            lines.push("");
            lines.push(compact);
            return lines.join("\n").trim();
        }
        return compact;
    }
    compactText(input, maxLength = 1200) {
        const cleaned = input
            .replace(/\r/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        const sliced = cleaned.slice(0, maxLength);
        const lastBoundary = Math.max(sliced.lastIndexOf("\n"), sliced.lastIndexOf("。"), sliced.lastIndexOf(". "), sliced.lastIndexOf("! "), sliced.lastIndexOf("? "));
        if (lastBoundary > Math.floor(maxLength * 0.5)) {
            return `${sliced.slice(0, lastBoundary).trim()}\n...`;
        }
        return `${sliced.trim()}...`;
    }
    pickFirstString(...values) {
        for (const value of values) {
            const text = this.asStringOrUndefined(value);
            if (text)
                return text;
        }
        return undefined;
    }
    asStringOrUndefined(value) {
        if (value === null || value === undefined)
            return undefined;
        if (typeof value === "string") {
            const text = value.trim();
            return text ? text : undefined;
        }
        if (typeof value === "number" || typeof value === "boolean") {
            return String(value);
        }
        return undefined;
    }
    asRecord(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
        }
        return value;
    }
    async handleApprovalRequirement(taskId, stepId, action, input, existingStartedAt, reason) {
        const pending = await this.taskStore.getLatestApprovalForStep(taskId, stepId);
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
