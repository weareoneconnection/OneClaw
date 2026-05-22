import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
function asString(value) {
    return String(value ?? "").trim();
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item));
}
export class ShellWorker {
    config;
    name = "shell_worker";
    constructor(config) {
        this.config = config;
    }
    async execute(input, context) {
        await context.log(`ShellWorker executing ${context.action}`);
        if (!this.config.shellEnabled) {
            return { ok: false, error: "Shell execution is disabled. Set ONECLAW_SHELL_ENABLED=true to enable guarded shell actions." };
        }
        const command = asString(input.command);
        if (!command)
            return { ok: false, error: "shell.exec requires input.command" };
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
