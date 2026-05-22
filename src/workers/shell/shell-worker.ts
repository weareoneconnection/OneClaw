import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppConfig } from "../../config.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

const execFileAsync = promisify(execFile);

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asStringArray(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

export class ShellWorker implements Worker {
  readonly name = "shell_worker";

  constructor(private readonly config: AppConfig) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`ShellWorker executing ${context.action}`);

    if (!this.config.shellEnabled) {
      return { ok: false, error: "Shell execution is disabled. Set ONECLAW_SHELL_ENABLED=true to enable guarded shell actions." };
    }

    const command = asString(input.command);
    if (!command) return { ok: false, error: "shell.exec requires input.command" };

    if (this.config.shellAllowlist.length && !this.config.shellAllowlist.includes(command)) {
      return { ok: false, error: `Command is not allowlisted: ${command}` };
    }

    const args = asStringArray(input.args);
    const cwd = asString(input.cwd) || process.cwd();
    const timeoutMs = Number(input.timeoutMs ?? 15000);
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
      maxBuffer: 1024 * 1024,
    });

    return {
      ok: true,
      output: {
        action: context.action,
        command,
        args,
        cwd,
        stdout,
        stderr,
      },
    };
  }
}
