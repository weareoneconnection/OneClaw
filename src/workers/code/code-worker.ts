import path from "node:path";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import type { GitHubAdapter } from "../../adapters/github/github-adapter.js";
import { buildAgentReceipt, runAgentTask } from "./agent-engine/loop.js";
import { getAgentEngineConfig } from "./agent-engine/llm-client.js";
import { rollbackWorkspace } from "./agent-engine/workspace.js";
import { registerAgentRun, releaseAgentRun } from "./agent-engine/run-registry.js";
import { readPriorContext, writeSessionRecord } from "./agent-engine/session.js";

const execFileAsync = promisify(execFile);

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asContentString(value: Json | undefined): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function isRecord(value: Json | undefined): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asJsonArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function normalizeWorkspaceRoots() {
  const configured =
    process.env.ONECLAW_CODE_WORKSPACE_ALLOWLIST ||
    process.env.ONECLAW_WORKSPACE_ALLOWLIST ||
    process.cwd();

  return configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

function positiveNumber(value: string | undefined, fallback: number) {
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
    commandExecution: "approved_package_scripts_only",
  };
}

const SAFE_VALIDATION_SCRIPTS = new Set([
  "check",
  "lint",
  "test",
  "typecheck",
  "type-check",
  "build",
]);

function rollbackDirectory(workspacePath: string) {
  return path.join(workspacePath, ".oneclaw", "rollback");
}

async function runWorkspaceCommand(
  workspacePath: string,
  command: string,
  args: string[],
  timeoutMs: number
) {
  const commandEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => (
      !/(TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|AUTH|COOKIE|CREDENTIAL)/i.test(key)
    ))
  );
  const result = await execFileAsync(command, args, {
    cwd: workspacePath,
    timeout: timeoutMs,
    maxBuffer: 2_000_000,
    env: {
      ...commandEnv,
      CI: "1",
      NO_COLOR: "1",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_offline: "true",
      npm_config_update_notifier: "false",
      ONECLAW_SANDBOX_NETWORK: "none",
    },
  });
  return {
    stdout: String(result.stdout || "").slice(-80_000),
    stderr: String(result.stderr || "").slice(-80_000),
  };
}

async function gitOutput(workspacePath: string, args: string[], timeoutMs: number) {
  return runWorkspaceCommand(workspacePath, "git", args, timeoutMs);
}

async function availablePackageScripts(workspacePath: string) {
  const packagePath = path.join(workspacePath, "package.json");
  const raw = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return parsed.scripts || {};
}

async function persistRollbackBundle(input: {
  workspacePath: string;
  taskId: string;
  stepId: string;
  files: Array<{ relativePath: string; before: string; existed: boolean }>;
}) {
  const token = `${Date.now()}-${randomUUID()}`;
  const directory = path.join(rollbackDirectory(input.workspacePath), token);
  await mkdir(directory, { recursive: true });
  const manifest = {
    version: 1,
    token,
    taskId: input.taskId,
    stepId: input.stepId,
    createdAt: new Date().toISOString(),
    files: input.files.map((file, index) => ({
      path: file.relativePath,
      existed: file.existed,
      backupFile: `${index}.txt`,
    })),
  };
  await Promise.all(input.files.map((file, index) => (
    writeFile(path.join(directory, `${index}.txt`), file.before, "utf8")
  )));
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return token;
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWorkspace(input: Record<string, Json>) {
  const requested = asString(input.workspacePath || input.cwd || input.root) || process.cwd();
  const workspacePath = path.resolve(requested);
  const allowedRoots = normalizeWorkspaceRoots();
  const allowed = allowedRoots.some((root) => isInside(root, workspacePath));

  if (!allowed) {
    throw new Error(
      `workspacePath is outside ONECLAW_CODE_WORKSPACE_ALLOWLIST: ${workspacePath}`
    );
  }

  return { workspacePath, allowedRoots };
}

function resolveWorkspaceFile(workspacePath: string, filePath: string) {
  const cleanPath = filePath.trim();
  if (!cleanPath) throw new Error("code file path is required");
  if (path.isAbsolute(cleanPath)) throw new Error("code file path must be relative to workspacePath");

  const resolved = path.resolve(workspacePath, cleanPath);
  if (!isInside(workspacePath, resolved)) {
    throw new Error(`code file path escapes workspacePath: ${cleanPath}`);
  }

  return {
    relativePath: path.relative(workspacePath, resolved),
    absolutePath: resolved,
  };
}

// Planner file lists come in two flavors: full write payloads (entries carry
// content/after/newContent) and path-only hints of what to touch. Only the
// former can drive direct-write mode.
function hasDirectWriteContent(input: Record<string, Json>) {
  return asJsonArray(input.files || input.changes || input.patchFiles).some((item) => (
    isRecord(item) && (
      Object.prototype.hasOwnProperty.call(item, "content") ||
      Object.prototype.hasOwnProperty.call(item, "after") ||
      Object.prototype.hasOwnProperty.call(item, "newContent")
    )
  ));
}

function fileHintPaths(input: Record<string, Json>) {
  return asJsonArray(input.files || input.changes || input.patchFiles)
    .map((item) => (isRecord(item) ? asString(item.path || item.filePath || item.relativePath) : asString(item)))
    .filter(Boolean)
    .slice(0, 20);
}

function extractCodeFiles(input: Record<string, Json>) {
  const rawFiles = asJsonArray(input.files || input.changes || input.patchFiles);
  return rawFiles.map((item, index) => {
    if (!isRecord(item)) throw new Error(`files[${index}] must be an object`);
    const filePath = asString(item.path || item.filePath || item.relativePath);
    const hasContent = Object.prototype.hasOwnProperty.call(item, "content");
    const hasAfter = Object.prototype.hasOwnProperty.call(item, "after");
    const hasNewContent = Object.prototype.hasOwnProperty.call(item, "newContent");
    const content = asContentString(
      hasContent ? item.content : hasAfter ? item.after : item.newContent
    );
    if (!filePath) throw new Error(`files[${index}].path is required`);
    if (!hasContent && !hasAfter && !hasNewContent) {
      throw new Error(`files[${index}].content is required`);
    }
    return { path: filePath, content };
  });
}

function validateCodeFiles(files: Array<{ path: string; content: string }>) {
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

function assertWithinTimeout(startedAt: number, timeoutMs: number) {
  if (Date.now() - startedAt > timeoutMs) {
    throw new Error(`Code sandbox timed out after ${timeoutMs}ms`);
  }
}

async function nearestExistingParent(filePath: string) {
  let current = filePath;
  while (true) {
    const exists = await stat(current).then(() => true).catch(() => false);
    if (exists) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

async function ensureNoSymlinkEscape(workspacePath: string, absolutePath: string) {
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

async function atomicWrite(filePath: string, content: string, suffix: string) {
  const temporaryPath = `${filePath}.oneclaw-${suffix}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

async function readExistingText(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function fileExists(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function buildLineDiff(relativePath: string, before: string, after: string) {
  if (before === after) return `diff -- ${relativePath}\n(no changes)\n`;

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
    } else {
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

function githubError(action: string, response: { status: number; body: Json | string }) {
  const body = typeof response.body === "string"
    ? response.body
    : JSON.stringify(response.body);
  return `${action} GitHub API returned ${response.status}: ${body}`;
}

export class CodeWorker implements Worker {
  readonly name = "code_worker";

  constructor(private readonly github?: GitHubAdapter) {}

  // Runs the self-hosted agent loop against a workspace objective and returns
  // a theone.agent_receipt.v1 (diff + commands + token usage) as proof.
  private async runAgentObjective(
    objective: string,
    input: Record<string, Json>,
    context: ExecutionContext
  ): Promise<WorkerExecutionResult> {
    try {
      const { workspacePath } = resolveWorkspace(input);
      if (!getAgentEngineConfig().apiKey) {
        return {
          ok: false,
          error: "Agent engine is disabled: ANTHROPIC_API_KEY is not configured on this runtime",
        };
      }

      const startedAt = new Date().toISOString();
      await context.log(`Agent engine run starting in ${workspacePath}`);
      const priorContext = input.freshSession === true ? null : await readPriorContext(workspacePath);
      if (priorContext) await context.log("Agent engine resuming with previous session context.");

      // Live progress: every engine event lands in the task log so the chat
      // page can poll it while the run is still going.
      const controller = registerAgentRun(context.taskId);
      let result;
      try {
        result = await runAgentTask({
          objective,
          workspace: workspacePath,
          maxTurns: positiveNumber(process.env.AGENT_ENGINE_MAX_TURNS, 50),
          maxToolCalls: positiveNumber(process.env.AGENT_ENGINE_MAX_TOOL_CALLS, 200),
          model: asString(input.model) || undefined,
          snapshot: true,
          priorContext: priorContext || undefined,
          signal: controller.signal,
          onEvent: (event) => {
            void context.log(`[agent:${event.type}] ${event.detail.slice(0, 300)}`);
          },
        });
      } finally {
        releaseAgentRun(context.taskId);
      }
      await writeSessionRecord(workspacePath, objective, result);
      const receipt = await buildAgentReceipt(result, workspacePath, {
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      await context.log(
        `Agent engine finished: ${result.status} (${result.turns} turns, ${result.toolCalls} tool calls, ${receipt.usage.inputTokens}+${receipt.usage.outputTokens} tokens)`
      );

      const succeeded = result.status === "completed";
      return {
        ok: succeeded,
        error: succeeded ? undefined : `Agent run ended with status ${result.status}: ${result.summary.slice(0, 500)}`,
        output: {
          provider: "code",
          action: context.action,
          status: succeeded
            ? result.verified ? "agent_run_completed" : "agent_run_completed_unverified"
            : result.status === "aborted" ? "agent_run_aborted" : "agent_run_incomplete",
          verified: result.verified,
          mode: "agent_engine",
          workspacePath,
          summary: result.summary,
          // Top-level mirrors of the receipt so existing diff/status cards
          // (theone.code_runtime.v2) render agent runs without changes.
          diff: receipt.diff,
          diffStat: receipt.diffStat,
          changedFiles: result.editedFiles.map((file) => ({ path: file, changed: true })) as unknown as Json,
          // Named agentReceipt because the task pipeline attaches its own
          // generic `receipt` object to every step output.
          agentReceipt: receipt as unknown as Json,
          rollbackToken: result.snapshotCommit,
          sandbox: {
            ...sandboxLimits(),
            filesystem: "read_write_approved",
            commandExecution: "agent_workspace_shell",
            rollback: result.snapshotCommit
              ? "git_snapshot_commit"
              : "unavailable_not_a_git_repo",
          },
        },
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
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
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.diff.prepare") {
      // Agent-mode plans carry an objective and path hints only — the real
      // diff is produced by the agent run inside code.patch.apply.
      const diffObjective = asString(input.objective || input.goal);
      if (diffObjective && !hasDirectWriteContent(input)) {
        try {
          const { workspacePath } = resolveWorkspace(input);
          return {
            ok: true,
            output: {
              provider: "code",
              action: context.action,
              status: "diff_deferred_to_agent",
              mode: "agent_engine",
              workspacePath,
              files: fileHintPaths(input).map((file) => ({ path: file, exists: true, changed: false })) as unknown as Json,
              diff: "",
              applyReady: true,
              note: "Agent mode: the diff will be produced by the coding-agent run in code.patch.apply and returned in its receipt.",
            },
          };
        } catch (error) {
          return { ok: false, error: (error as Error).message };
        }
      }
      try {
        const startedAt = Date.now();
        const { workspacePath } = resolveWorkspace(input);
        const files = extractCodeFiles(input);
        if (!files.length) return { ok: false, error: "code.diff.prepare requires input.files[] or input.objective" };
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
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.patch.apply") {
      // Agent mode: an objective without real write payloads hands the task
      // to the self-hosted agent loop (explore → edit → verify in-workspace).
      // Path-only files[] entries are treated as hints, not payloads.
      const objective = asString(input.objective || input.goal);
      if (objective && !hasDirectWriteContent(input)) {
        const hints = fileHintPaths(input);
        const objectiveWithHints = hints.length
          ? `${objective}\n\nFiles likely involved: ${hints.join(", ")}`
          : objective;
        return this.runAgentObjective(objectiveWithHints, input, context);
      }
      try {
        const startedAt = Date.now();
        const { workspacePath } = resolveWorkspace(input);
        const files = extractCodeFiles(input);
        if (!files.length) return { ok: false, error: "code.patch.apply requires input.files[] or input.objective" };
        const sandbox = validateCodeFiles(files);

        const changedFiles = [];
        const diffs = [];
        const backups: Array<{ absolutePath: string; relativePath: string; before: string; existed: boolean }> = [];
        for (const file of files) {
          assertWithinTimeout(startedAt, sandbox.timeoutMs);
          const resolved = resolveWorkspaceFile(workspacePath, file.path);
          await ensureNoSymlinkEscape(workspacePath, resolved.absolutePath);
          const existed = await fileExists(resolved.absolutePath);
          const before = await readExistingText(resolved.absolutePath);
          backups.push({
            absolutePath: resolved.absolutePath,
            relativePath: resolved.relativePath,
            before,
            existed,
          });
        }

        const rollbackToken = await persistRollbackBundle({
          workspacePath,
          taskId: context.taskId,
          stepId: context.stepId,
          files: backups.map((backup) => ({
            relativePath: backup.relativePath,
            before: backup.before,
            existed: backup.existed,
          })),
        });

        try {
          for (const [index, file] of files.entries()) {
            assertWithinTimeout(startedAt, sandbox.timeoutMs);
            const backup = backups[index];
            const resolved = {
              absolutePath: backup.absolutePath,
              relativePath: backup.relativePath,
            };
            const before = backup.before;
            const diff = buildLineDiff(resolved.relativePath, before, file.content);
            await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
            await atomicWrite(
              resolved.absolutePath,
              file.content,
              `${context.taskId}-${context.stepId}-${index}`.replace(/[^a-zA-Z0-9_-]/g, "-")
            );
            diffs.push(diff);
            changedFiles.push({
              path: resolved.relativePath,
              changed: before !== file.content,
              beforeLength: before.length,
              afterLength: file.content.length,
            });
          }
        } catch (error) {
          for (const backup of backups.reverse()) {
            if (backup.existed) {
              await writeFile(backup.absolutePath, backup.before, "utf8").catch(() => undefined);
            } else {
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
            rollbackToken,
            sandbox: {
              ...sandbox,
              filesystem: "read_write_approved",
              atomicWrites: true,
              rollback: "automatic_on_failure_and_tokenized_restore",
              elapsedMs: Date.now() - startedAt,
            },
          },
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.test.run") {
      try {
        const startedAt = Date.now();
        const { workspacePath } = resolveWorkspace(input);
        const sandbox = sandboxLimits();
        const packageScripts = await availablePackageScripts(workspacePath);
        const requested = asJsonArray(input.scripts).map((item) => asString(item));
        const scripts = (requested.length ? requested : ["check", "typecheck", "lint", "test", "build"])
          .filter((script, index, values) => values.indexOf(script) === index)
          .filter((script) => SAFE_VALIDATION_SCRIPTS.has(script) && Boolean(packageScripts[script]))
          .slice(0, 4);
        if (!scripts.length) {
          return {
            ok: false,
            error: "No approved validation script was found in package.json (check, typecheck, lint, test, build)",
          };
        }

        const results: Array<Record<string, Json>> = [];
        for (const script of scripts) {
          assertWithinTimeout(startedAt, sandbox.timeoutMs);
          const remaining = Math.max(1_000, sandbox.timeoutMs - (Date.now() - startedAt));
          try {
            const output = await runWorkspaceCommand(workspacePath, "npm", ["run", script], remaining);
            results.push({ script, status: "passed", ...output });
          } catch (error) {
            const failure = error as Error & { stdout?: string; stderr?: string; code?: number };
            results.push({
              script,
              status: "failed",
              stdout: String(failure.stdout || "").slice(-80_000),
              stderr: String(failure.stderr || failure.message).slice(-80_000),
              exitCode: Number(failure.code || 1),
            });
            break;
          }
        }
        const passed = results.every((result) => result.status === "passed");
        return {
          ok: passed,
          error: passed ? undefined : "One or more approved validation scripts failed",
          output: {
            provider: "code",
            action: context.action,
            status: passed ? "tests_passed" : "tests_failed",
            workspacePath,
            passed,
            results,
            elapsedMs: Date.now() - startedAt,
            sandbox: { ...sandbox, commandExecution: "approved_package_scripts_only" },
          },
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.verify") {
      try {
        const { workspacePath } = resolveWorkspace(input);
        const timeoutMs = sandboxLimits().timeoutMs;
        const [statusResult, statResult] = await Promise.all([
          gitOutput(workspacePath, ["status", "--short", "--branch"], timeoutMs),
          gitOutput(workspacePath, ["diff", "--stat"], timeoutMs),
        ]);
        let diffCheck = { passed: true, output: "" };
        try {
          const result = await gitOutput(workspacePath, ["diff", "--check"], timeoutMs);
          diffCheck = { passed: true, output: result.stdout || result.stderr };
        } catch (error) {
          diffCheck = { passed: false, output: (error as Error).message };
        }
        return {
          ok: diffCheck.passed,
          error: diffCheck.passed ? undefined : "git diff --check reported invalid whitespace or conflict markers",
          output: {
            provider: "code",
            action: context.action,
            status: diffCheck.passed ? "verification_passed" : "verification_failed",
            workspacePath,
            passed: diffCheck.passed,
            gitStatus: statusResult.stdout,
            diffStat: statResult.stdout,
            diffCheck,
          },
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.patch.rollback") {
      try {
        const { workspacePath } = resolveWorkspace(input);
        const rollbackToken = asString(input.rollbackToken);
        if (!rollbackToken || !/^[a-zA-Z0-9-]+$/.test(rollbackToken)) {
          return { ok: false, error: "code.patch.rollback requires a valid input.rollbackToken" };
        }
        // Agent-engine runs use a git snapshot commit as their rollback token.
        const directory = path.join(rollbackDirectory(workspacePath), rollbackToken);
        const hasBundle = await stat(path.join(directory, "manifest.json")).then(() => true).catch(() => false);
        if (!hasBundle && /^[0-9a-f]{7,40}$/.test(rollbackToken)) {
          const restored = await rollbackWorkspace(workspacePath, rollbackToken);
          if (!restored) {
            return { ok: false, error: `git rollback to snapshot ${rollbackToken} failed` };
          }
          return {
            ok: true,
            output: {
              provider: "code",
              action: context.action,
              status: "patch_rolled_back",
              mode: "agent_engine",
              workspacePath,
              rollbackToken,
              method: "git_checkout_snapshot",
            },
          };
        }
        const manifestRaw = await readFile(path.join(directory, "manifest.json"), "utf8");
        const manifest = JSON.parse(manifestRaw) as {
          files?: Array<{ path: string; existed: boolean; backupFile: string }>;
        };
        const restored: string[] = [];
        for (const file of manifest.files || []) {
          const resolved = resolveWorkspaceFile(workspacePath, file.path);
          await ensureNoSymlinkEscape(workspacePath, resolved.absolutePath);
          if (file.existed) {
            const before = await readFile(path.join(directory, file.backupFile), "utf8");
            await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
            await atomicWrite(resolved.absolutePath, before, `${rollbackToken}-restore`);
          } else {
            await rm(resolved.absolutePath, { force: true });
          }
          restored.push(resolved.relativePath);
        }
        return {
          ok: true,
          output: {
            provider: "code",
            action: context.action,
            status: "patch_rolled_back",
            workspacePath,
            rollbackToken,
            restoredFiles: restored,
          },
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.commit.prepare") {
      try {
        const { workspacePath } = resolveWorkspace(input);
        const timeoutMs = sandboxLimits().timeoutMs;
        const [branch, statusResult, statResult] = await Promise.all([
          gitOutput(workspacePath, ["branch", "--show-current"], timeoutMs),
          gitOutput(workspacePath, ["status", "--short"], timeoutMs),
          gitOutput(workspacePath, ["diff", "--stat"], timeoutMs),
        ]);
        const message = asString(input.message || input.commitMessage) || "Update code through TheOne";
        return {
          ok: true,
          output: {
            provider: "code",
            action: context.action,
            status: "commit_prepared",
            workspacePath,
            branch: branch.stdout.trim(),
            message,
            gitStatus: statusResult.stdout,
            diffStat: statResult.stdout,
            ready: Boolean(statusResult.stdout.trim()),
          },
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    if (context.action === "code.pr.create") {
      const title = asString(input.title);
      const branch = asString(input.branch || input.head);
      if (!repo || !title || !branch) {
        return { ok: false, error: "code.pr.create requires input.repo, input.title, and input.branch" };
      }
      return {
        ok: true,
        output: {
          provider,
          action: context.action,
          status: "pull_request_prepared",
          repo,
          title,
          branch,
          base: asString(input.base || "main"),
          body: asString(input.body),
          approvalRequired: true,
        },
      };
    }

    if (context.action === "git.issue.create") {
      const title = asString(input.title);
      if (!repo || !title) return { ok: false, error: "git.issue.create requires input.repo and input.title" };
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
      if (!repo || !title || !branch) return { ok: false, error: "git.pr.create requires input.repo, input.title, and input.branch" };
      return { ok: true, output: { provider, action: context.action, status: "pull_request_prepared", repo, title, branch, base: asString(input.base || "main") } };
    }

    if (context.action === "git.ci.status") {
      if (!repo) return { ok: false, error: "git.ci.status requires input.repo" };
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
      if (!repo) return { ok: false, error: "git.repo.get requires input.repo" };
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
      if (!repo) return { ok: false, error: "git.checks.list requires input.repo" };
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
      if (!repo) return { ok: false, error: "git.actions.runs requires input.repo" };
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
      if (!query) return { ok: false, error: "git.repo.search requires input.query" };
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
