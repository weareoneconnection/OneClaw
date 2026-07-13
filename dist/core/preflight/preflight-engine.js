import path from "node:path";
function check(id, status, label, detail) {
    return { id, status, label, detail };
}
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return value;
}
function hostMatchesAllowlist(urlValue, allowlist) {
    if (allowlist.length === 0)
        return true;
    try {
        const url = new URL(urlValue);
        return allowlist.some((allowed) => {
            const normalized = String(allowed ?? "").trim();
            if (!normalized)
                return false;
            let allowedHost = normalized;
            try {
                allowedHost = new URL(normalized).hostname;
            }
            catch {
                allowedHost = normalized.replace(/^https?:\/\//, "").split("/")[0] ?? normalized;
            }
            return url.hostname === allowedHost || url.hostname.endsWith(`.${allowedHost}`);
        });
    }
    catch {
        return false;
    }
}
function pathMatchesAllowlist(filePath, allowlist) {
    if (allowlist.length === 0)
        return true;
    const resolved = path.resolve(filePath);
    return allowlist.some((allowed) => {
        const root = path.resolve(allowed);
        return resolved === root || resolved.startsWith(`${root}${path.sep}`);
    });
}
function hasRequiredInput(step, capability) {
    const input = asRecord(step.input);
    return (capability.inputSchema?.required ?? []).every((field) => {
        const value = input[field];
        return value !== undefined && value !== null && value !== "";
    });
}
export class PreflightEngine {
    capabilities;
    config;
    constructor(capabilities, config) {
        this.capabilities = capabilities;
        this.config = config;
    }
    evaluate(task) {
        const checks = [];
        const approvalActions = new Set();
        const deniedActions = new Set();
        const unsupportedActions = new Set();
        const actions = task.steps.map((step) => step.action);
        for (const step of task.steps) {
            const capability = this.capabilities.get(step.action);
            if (!capability) {
                unsupportedActions.add(step.action);
                checks.push(check(`capability:${step.id}`, "fail", step.action, "Action is not registered."));
                continue;
            }
            checks.push(check(`capability:${step.id}`, capability.maturity === "stub" ? "fail" : capability.maturity === "planned" ? "warn" : "pass", step.action, `${capability.description} · ${capability.maturity ?? "guarded"}`));
            if (capability.maturity === "stub")
                deniedActions.add(step.action);
            if (capability.approvalRequired || capability.risk === "high" || capability.risk === "critical" || task.approvalMode === "manual") {
                approvalActions.add(step.action);
            }
            if (!hasRequiredInput(step, capability)) {
                deniedActions.add(step.action);
                checks.push(check(`input:${step.id}`, "fail", `${step.action} input`, `Missing required input: ${(capability.inputSchema?.required ?? []).join(", ")}`));
            }
            checks.push(...this.evaluateSandbox(step.action, asRecord(step.input), step.id));
        }
        const hasFailures = checks.some((item) => item.status === "fail");
        const needsApproval = approvalActions.size > 0;
        return {
            ok: !hasFailures,
            status: hasFailures ? "blocked" : needsApproval ? "needs_approval" : "ready",
            taskName: task.taskName,
            actions,
            checks,
            approvalActions: [...approvalActions],
            deniedActions: [...deniedActions],
            unsupportedActions: [...unsupportedActions],
        };
    }
    evaluateStep(action, input, stepId = "step") {
        return this.evaluate({
            taskName: `step:${action}`,
            approvalMode: "auto",
            steps: [{ id: stepId, action, input, dependsOn: [] }],
        });
    }
    evaluateSandbox(action, input, stepId) {
        if (action.startsWith("file.")) {
            const filePath = typeof input.path === "string" ? input.path : "";
            if (!filePath)
                return [];
            return [
                check(`sandbox:file:${stepId}`, pathMatchesAllowlist(filePath, this.config.fileAllowlist) ? "pass" : "fail", "File sandbox", this.config.fileAllowlist.length
                    ? `Path must stay inside: ${this.config.fileAllowlist.join(", ")}`
                    : "No file allowlist configured; development mode allows all paths."),
            ];
        }
        if (action.startsWith("api.")) {
            const url = typeof input.url === "string" ? input.url : "";
            if (!url)
                return [];
            return [
                check(`sandbox:api:${stepId}`, hostMatchesAllowlist(url, this.config.apiAllowlist) ? "pass" : "fail", "API sandbox", this.config.apiAllowlist.length
                    ? `Host must match: ${this.config.apiAllowlist.join(", ")}`
                    : "No API allowlist configured; development mode allows all hosts."),
            ];
        }
        if (action.startsWith("browser.")) {
            const url = typeof input.url === "string" ? input.url : "";
            if (!url)
                return [];
            return [
                check(`sandbox:browser:${stepId}`, hostMatchesAllowlist(url, this.config.browserAllowlist) ? "pass" : "fail", "Browser sandbox", this.config.browserAllowlist.length
                    ? `Host must match: ${this.config.browserAllowlist.join(", ")}`
                    : "No browser allowlist configured; development mode allows all hosts."),
            ];
        }
        if (action.startsWith("shell.")) {
            return [
                check(`sandbox:shell:${stepId}`, this.config.shellEnabled ? "warn" : "fail", "Shell sandbox", this.config.shellEnabled ? "Shell is enabled and must remain approval gated." : "Shell execution is disabled by default."),
            ];
        }
        if (action.startsWith("code.")) {
            const workspacePath = typeof input.workspacePath === "string" ? input.workspacePath : "";
            const checks = [];
            if (workspacePath) {
                const codeRoots = this.config.codeWorkspaceAllowlist.length
                    ? this.config.codeWorkspaceAllowlist
                    : [process.cwd()];
                checks.push(check(`sandbox:code-workspace:${stepId}`, pathMatchesAllowlist(workspacePath, codeRoots) ? "pass" : "fail", "Code workspace sandbox", this.config.codeWorkspaceAllowlist.length
                    ? `Workspace must stay inside: ${this.config.codeWorkspaceAllowlist.join(", ")}`
                    : "No code workspace allowlist configured; only the OneClaw process workspace is allowed."));
            }
            checks.push(check(`sandbox:code-limits:${stepId}`, action === "code.patch.apply" ? "warn" : "pass", "Code resource sandbox", `Maximum ${this.config.codeMaxFiles} files, ${this.config.codeMaxFileBytes} bytes per file, ` +
                `${this.config.codeMaxTotalBytes} total bytes, ${this.config.codeTimeoutMs}ms timeout; network and shell are disabled.`));
            return checks;
        }
        return [];
    }
}
