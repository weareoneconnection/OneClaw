import path from "node:path";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
function asString(value) {
    return String(value ?? "").trim();
}
function asContentString(value) {
    return typeof value === "string" ? value : String(value ?? "");
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function asJsonArray(value) {
    return Array.isArray(value) ? value : [];
}
function normalizeWorkspaceRoots() {
    const configured = process.env.ONECLAW_CODE_WORKSPACE_ALLOWLIST ||
        process.env.ONECLAW_WORKSPACE_ALLOWLIST ||
        process.cwd();
    return configured
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => path.resolve(item));
}
function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function sandboxLimits() {
    return {
        maxFiles: positiveNumber(process.env.ONECLAW_CODE_MAX_FILES, 40),
        maxFileBytes: positiveNumber(process.env.ONECLAW_CODE_MAX_FILE_BYTES, 512_000),
        maxTotalBytes: positiveNumber(process.env.ONECLAW_CODE_MAX_TOTAL_BYTES, 4_000_000),
        timeoutMs: positiveNumber(process.env.ONECLAW_CODE_TIMEOUT_MS, 60_000),
        networkEgress: "none",
        commandExecution: "disabled",
    };
}
function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function resolveWorkspace(input) {
    const requested = asString(input.workspacePath || input.cwd || input.root) || process.cwd();
    const workspacePath = path.resolve(requested);
    const allowedRoots = normalizeWorkspaceRoots();
    const allowed = allowedRoots.some((root) => isInside(root, workspacePath));
    if (!allowed) {
        throw new Error(`workspacePath is outside ONECLAW_CODE_WORKSPACE_ALLOWLIST: ${workspacePath}`);
    }
    return { workspacePath, allowedRoots };
}
function resolveWorkspaceFile(workspacePath, filePath) {
    const cleanPath = filePath.trim();
    if (!cleanPath)
        throw new Error("code file path is required");
    if (path.isAbsolute(cleanPath))
        throw new Error("code file path must be relative to workspacePath");
    const resolved = path.resolve(workspacePath, cleanPath);
    if (!isInside(workspacePath, resolved)) {
        throw new Error(`code file path escapes workspacePath: ${cleanPath}`);
    }
    return {
        relativePath: path.relative(workspacePath, resolved),
        absolutePath: resolved,
    };
}
function extractCodeFiles(input) {
    const rawFiles = asJsonArray(input.files || input.changes || input.patchFiles);
    return rawFiles.map((item, index) => {
        if (!isRecord(item))
            throw new Error(`files[${index}] must be an object`);
        const filePath = asString(item.path || item.filePath || item.relativePath);
        const hasContent = Object.prototype.hasOwnProperty.call(item, "content");
        const hasAfter = Object.prototype.hasOwnProperty.call(item, "after");
        const hasNewContent = Object.prototype.hasOwnProperty.call(item, "newContent");
        const content = asContentString(hasContent ? item.content : hasAfter ? item.after : item.newContent);
        if (!filePath)
            throw new Error(`files[${index}].path is required`);
        if (!hasContent && !hasAfter && !hasNewContent) {
            throw new Error(`files[${index}].content is required`);
        }
        return { path: filePath, content };
    });
}
function validateCodeFiles(files) {
    const limits = sandboxLimits();
    if (files.length > limits.maxFiles) {
        throw new Error(`Code sandbox allows at most ${limits.maxFiles} files per task`);
    }
    let totalBytes = 0;
    for (const file of files) {
        const bytes = Buffer.byteLength(file.content, "utf8");
        if (bytes > limits.maxFileBytes) {
            throw new Error(`${file.path} exceeds the ${limits.maxFileBytes} byte code sandbox limit`);
        }
        totalBytes += bytes;
    }
    if (totalBytes > limits.maxTotalBytes) {
        throw new Error(`Code task exceeds the ${limits.maxTotalBytes} byte total sandbox limit`);
    }
    return { ...limits, totalBytes };
}
function assertWithinTimeout(startedAt, timeoutMs) {
    if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Code sandbox timed out after ${timeoutMs}ms`);
    }
}
async function nearestExistingParent(filePath) {
    let current = filePath;
    while (true) {
        const exists = await stat(current).then(() => true).catch(() => false);
        if (exists)
            return current;
        const parent = path.dirname(current);
        if (parent === current)
            return current;
        current = parent;
    }
}
async function ensureNoSymlinkEscape(workspacePath, absolutePath) {
    const workspaceRealPath = await realpath(workspacePath);
    const existingParent = await nearestExistingParent(path.dirname(absolutePath));
    const parentRealPath = await realpath(existingParent);
    if (!isInside(workspaceRealPath, parentRealPath)) {
        throw new Error(`code file path escapes workspace through a symlink: ${absolutePath}`);
    }
    const exists = await fileExists(absolutePath);
    if (exists) {
        const fileRealPath = await realpath(absolutePath);
        if (!isInside(workspaceRealPath, fileRealPath)) {
            throw new Error(`code file resolves outside workspacePath: ${absolutePath}`);
        }
    }
}
async function atomicWrite(filePath, content, suffix) {
    const temporaryPath = `${filePath}.oneclaw-${suffix}.tmp`;
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
}
async function readExistingText(filePath) {
    try {
        return await readFile(filePath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return "";
        throw error;
    }
}
async function fileExists(filePath) {
    try {
        const info = await stat(filePath);
        return info.isFile();
    }
    catch {
        return false;
    }
}
function buildLineDiff(relativePath, before, after) {
    if (before === after)
        return `diff -- ${relativePath}\n(no changes)\n`;
    const beforeLines = before.split(/\r?\n/);
    const afterLines = after.split(/\r?\n/);
    const maxLines = Math.max(beforeLines.length, afterLines.length);
    const output = [
        `--- a/${relativePath}`,
        `+++ b/${relativePath}`,
    ];
    let emitted = 0;
    for (let index = 0; index < maxLines; index += 1) {
        const oldLine = beforeLines[index];
        const newLine = afterLines[index];
        if (oldLine === newLine) {
            output.push(` ${oldLine ?? ""}`);
            emitted += 1;
        }
        else {
            if (oldLine !== undefined) {
                output.push(`-${oldLine}`);
                emitted += 1;
            }
            if (newLine !== undefined) {
                output.push(`+${newLine}`);
                emitted += 1;
            }
        }
        if (emitted >= 400) {
            output.push("... diff truncated after 400 lines ...");
            break;
        }
    }
    return `${output.join("\n")}\n`;
}
function githubError(action, response) {
    const body = typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body);
    return `${action} GitHub API returned ${response.status}: ${body}`;
}
export class CodeWorker {
    github;
    name = "code_worker";
    constructor(github) {
        this.github = github;
    }
    async execute(input, context) {
        await context.log(`CodeWorker executing ${context.action}`);
        const provider = asString(input.provider || "github");
        const repo = asString(input.repo);
        if (context.action === "code.workspace.status") {
            try {
                const { workspacePath, allowedRoots } = resolveWorkspace(input);
                const exists = await stat(workspacePath).then((info) => info.isDirectory()).catch(() => false);
                return {
                    ok: true,
                    output: {
                        provider: "code",
                        action: context.action,
                        status: "workspace_status_read",
                        workspacePath,
                        exists,
                        allowed: true,
                        allowedRoots,
                        sandbox: sandboxLimits(),
                    },
                };
            }
            catch (error) {
                return { ok: false, error: error.message };
            }
        }
        if (context.action === "code.diff.prepare") {
            try {
                const startedAt = Date.now();
                const { workspacePath } = resolveWorkspace(input);
                const files = extractCodeFiles(input);
                if (!files.length)
                    return { ok: false, error: "code.diff.prepare requires input.files[]" };
                const sandbox = validateCodeFiles(files);
                const prepared = [];
                const diffs = [];
                for (const file of files) {
                    assertWithinTimeout(startedAt, sandbox.timeoutMs);
                    const resolved = resolveWorkspaceFile(workspacePath, file.path);
                    await ensureNoSymlinkEscape(workspacePath, resolved.absolutePath);
                    const before = await readExistingText(resolved.absolutePath);
                    const exists = await fileExists(resolved.absolutePath);
                    const diff = buildLineDiff(resolved.relativePath, before, file.content);
                    diffs.push(diff);
                    prepared.push({
                        path: resolved.relativePath,
                        exists,
                        changed: before !== file.content,
                        beforeLength: before.length,
                        afterLength: file.content.length,
                    });
                }
                return {
                    ok: true,
                    output: {
                        provider: "code",
                        action: context.action,
                        status: "diff_prepared",
                        workspacePath,
                        files: prepared,
                        diff: diffs.join("\n"),
                        applyReady: true,
                        sandbox: {
                            ...sandbox,
                            filesystem: "read_only",
                            elapsedMs: Date.now() - startedAt,
                        },
                    },
                };
            }
            catch (error) {
                return { ok: false, error: error.message };
            }
        }
        if (context.action === "code.patch.apply") {
            try {
                const startedAt = Date.now();
                const { workspacePath } = resolveWorkspace(input);
                const files = extractCodeFiles(input);
                if (!files.length)
                    return { ok: false, error: "code.patch.apply requires input.files[]" };
                const sandbox = validateCodeFiles(files);
                const changedFiles = [];
                const diffs = [];
                const backups = [];
                try {
                    for (const [index, file] of files.entries()) {
                        assertWithinTimeout(startedAt, sandbox.timeoutMs);
                        const resolved = resolveWorkspaceFile(workspacePath, file.path);
                        await ensureNoSymlinkEscape(workspacePath, resolved.absolutePath);
                        const existed = await fileExists(resolved.absolutePath);
                        const before = await readExistingText(resolved.absolutePath);
                        const diff = buildLineDiff(resolved.relativePath, before, file.content);
                        backups.push({ absolutePath: resolved.absolutePath, before, existed });
                        await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
                        await atomicWrite(resolved.absolutePath, file.content, `${context.taskId}-${context.stepId}-${index}`.replace(/[^a-zA-Z0-9_-]/g, "-"));
                        diffs.push(diff);
                        changedFiles.push({
                            path: resolved.relativePath,
                            changed: before !== file.content,
                            beforeLength: before.length,
                            afterLength: file.content.length,
                        });
                    }
                }
                catch (error) {
                    for (const backup of backups.reverse()) {
                        if (backup.existed) {
                            await writeFile(backup.absolutePath, backup.before, "utf8").catch(() => undefined);
                        }
                        else {
                            await rm(backup.absolutePath, { force: true }).catch(() => undefined);
                        }
                    }
                    throw error;
                }
                return {
                    ok: true,
                    output: {
                        provider: "code",
                        action: context.action,
                        status: "patch_applied",
                        workspacePath,
                        changedFiles,
                        diff: diffs.join("\n"),
                        sandbox: {
                            ...sandbox,
                            filesystem: "read_write_approved",
                            atomicWrites: true,
                            rollback: "automatic_on_failure",
                            elapsedMs: Date.now() - startedAt,
                        },
                    },
                };
            }
            catch (error) {
                return { ok: false, error: error.message };
            }
        }
        if (context.action === "git.issue.create") {
            const title = asString(input.title);
            if (!repo || !title)
                return { ok: false, error: "git.issue.create requires input.repo and input.title" };
            if (provider === "github" && this.github?.isConfigured()) {
                const response = await this.github.createIssue({ repo, title, body: asString(input.body) });
                return {
                    ok: response.ok,
                    error: response.ok ? undefined : githubError(context.action, response),
                    output: {
                        provider,
                        action: context.action,
                        status: response.ok ? "issue_created" : "issue_create_failed",
                        repo,
                        response: response.body,
                    },
                };
            }
            return { ok: true, output: { provider, action: context.action, status: "issue_prepared", repo, title, body: asString(input.body) } };
        }
        if (context.action === "git.pr.create") {
            const title = asString(input.title);
            const branch = asString(input.branch);
            if (!repo || !title || !branch)
                return { ok: false, error: "git.pr.create requires input.repo, input.title, and input.branch" };
            return { ok: true, output: { provider, action: context.action, status: "pull_request_prepared", repo, title, branch, base: asString(input.base || "main") } };
        }
        if (context.action === "git.ci.status") {
            if (!repo)
                return { ok: false, error: "git.ci.status requires input.repo" };
            if (provider === "github" && this.github?.isConfigured()) {
                const response = await this.github.getCiStatus({ repo, ref: asString(input.ref) || undefined });
                return {
                    ok: response.ok,
                    error: response.ok ? undefined : githubError(context.action, response),
                    output: {
                        provider,
                        action: context.action,
                        status: response.ok ? "ci_status_read" : "ci_status_failed",
                        repo,
                        ref: asString(input.ref || "main"),
                        response: response.body,
                    },
                };
            }
            return { ok: true, output: { provider, action: context.action, status: "ci_status_prepared", repo, ref: asString(input.ref) } };
        }
        if (context.action === "git.repo.get") {
            if (!repo)
                return { ok: false, error: "git.repo.get requires input.repo" };
            if (provider === "github" && this.github?.isConfigured()) {
                const response = await this.github.getRepo(repo);
                return {
                    ok: response.ok,
                    error: response.ok ? undefined : githubError(context.action, response),
                    output: {
                        provider,
                        action: context.action,
                        status: response.ok ? "repo_read" : "repo_read_failed",
                        repo,
                        response: response.body,
                    },
                };
            }
            return { ok: true, output: { provider, action: context.action, status: "repo_get_prepared", repo } };
        }
        if (context.action === "git.checks.list") {
            if (!repo)
                return { ok: false, error: "git.checks.list requires input.repo" };
            if (provider === "github" && this.github?.isConfigured()) {
                const response = await this.github.listChecks({ repo, ref: asString(input.ref) || undefined });
                return {
                    ok: response.ok,
                    error: response.ok ? undefined : githubError(context.action, response),
                    output: {
                        provider,
                        action: context.action,
                        status: response.ok ? "checks_read" : "checks_read_failed",
                        repo,
                        ref: asString(input.ref || "main"),
                        response: response.body,
                    },
                };
            }
            return { ok: true, output: { provider, action: context.action, status: "checks_list_prepared", repo, ref: asString(input.ref) } };
        }
        if (context.action === "git.actions.runs") {
            if (!repo)
                return { ok: false, error: "git.actions.runs requires input.repo" };
            if (provider === "github" && this.github?.isConfigured()) {
                const response = await this.github.listActionRuns({ repo, branch: asString(input.branch || input.ref) || undefined });
                return {
                    ok: response.ok,
                    error: response.ok ? undefined : githubError(context.action, response),
                    output: {
                        provider,
                        action: context.action,
                        status: response.ok ? "actions_runs_read" : "actions_runs_failed",
                        repo,
                        branch: asString(input.branch || input.ref),
                        response: response.body,
                    },
                };
            }
            return { ok: true, output: { provider, action: context.action, status: "actions_runs_prepared", repo, branch: asString(input.branch || input.ref) } };
        }
        if (context.action === "git.repo.search") {
            const query = asString(input.query);
            if (!query)
                return { ok: false, error: "git.repo.search requires input.query" };
            if (provider === "github" && this.github?.isConfigured()) {
                const response = await this.github.searchRepos(query);
                return {
                    ok: response.ok,
                    error: response.ok ? undefined : githubError(context.action, response),
                    output: {
                        provider,
                        action: context.action,
                        status: response.ok ? "repo_search_completed" : "repo_search_failed",
                        query,
                        response: response.body,
                    },
                };
            }
            return { ok: true, output: { provider, action: context.action, status: "repo_search_prepared", query, results: [] } };
        }
        return { ok: false, error: `Unsupported code action: ${context.action}` };
    }
}
