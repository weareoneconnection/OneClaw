export const CODE_TASK_SCHEMA_VERSION = "theone.code_task.v1";
const aliases = {
    "code.workspace.scan": "code.workspace.status",
    "code.workspace.status": "code.workspace.status",
    "code.patch.prepare": "code.diff.prepare",
    "code.diff.prepare": "code.diff.prepare",
    "code.patch.apply": "code.patch.apply",
};
function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
export function normalizeCodeTask(input) {
    const repairs = [];
    const taskMetadata = asRecord(input.task.metadata);
    const existingCodeTask = asRecord(taskMetadata.codeTask);
    const taskWorkspacePath = String(existingCodeTask.workspacePath || taskMetadata.workspacePath || "").trim();
    const timeoutMs = positiveNumber(process.env.ONECLAW_CODE_TIMEOUT_MS, 60_000);
    const steps = input.steps.map((step) => {
        const canonical = aliases[step.action];
        if (!canonical)
            return step;
        if (canonical !== step.action)
            repairs.push(`${step.action}->${canonical}`);
        const workspacePath = String(step.input.workspacePath || taskWorkspacePath).trim();
        return {
            ...step,
            action: canonical,
            timeoutMs: Math.min(step.timeoutMs || timeoutMs, timeoutMs),
            input: workspacePath ? { ...step.input, workspacePath } : step.input,
            metadata: {
                ...(step.metadata || {}),
                codeTaskSchemaVersion: CODE_TASK_SCHEMA_VERSION,
            },
        };
    });
    const codeSteps = steps.filter((step) => step.action.startsWith("code."));
    if (!codeSteps.length)
        return { steps, approvalMode: input.approvalMode, metadata: input.task.metadata };
    const write = codeSteps.some((step) => step.action === "code.patch.apply");
    const runtimeTarget = String(process.env.ONECLAW_CODE_RUNTIME_TARGET ||
        (process.env.ONECLAW_BRIDGE_MODE === "desktop" ? "local_bridge" : "cloud_sandbox"));
    return {
        steps,
        approvalMode: write ? "manual" : input.approvalMode,
        metadata: {
            ...taskMetadata,
            codeTask: {
                ...existingCodeTask,
                schemaVersion: CODE_TASK_SCHEMA_VERSION,
                kind: "software_engineering",
                canonicalActions: codeSteps.map((step) => step.action),
                aliasRepairs: repairs,
                runtime: {
                    target: runtimeTarget,
                    status: "ready",
                },
                sandbox: {
                    id: "oneclaw.code_sandbox.v1",
                    filesystem: write ? "read_write_approved" : "read_only",
                    networkEgress: "none",
                    commandExecution: "disabled",
                    maxFiles: positiveNumber(process.env.ONECLAW_CODE_MAX_FILES, 40),
                    maxFileBytes: positiveNumber(process.env.ONECLAW_CODE_MAX_FILE_BYTES, 512_000),
                    maxTotalBytes: positiveNumber(process.env.ONECLAW_CODE_MAX_TOTAL_BYTES, 4_000_000),
                    timeoutMs,
                    rollbackRequired: write,
                },
            },
        },
    };
}
