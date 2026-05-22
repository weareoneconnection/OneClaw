import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../config.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class StorageWorker implements Worker {
  readonly name = "storage_worker";

  constructor(private readonly config: AppConfig) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`StorageWorker executing ${context.action}`);
    const key = asString(input.key || input.path);
    const root = path.resolve(this.config.artifactsDir, "storage");
    const target = path.resolve(root, key);

    if (!key || !target.startsWith(root)) return { ok: false, error: `${context.action} requires safe input.key` };

    if (context.action === "storage.put") {
      const content = String(input.content ?? "");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      return { ok: true, output: { action: context.action, key, path: target, bytes: Buffer.byteLength(content) }, artifacts: [target] };
    }

    if (context.action === "storage.get") {
      const content = await fs.readFile(target, "utf8");
      return { ok: true, output: { action: context.action, key, path: target, content }, artifacts: [target] };
    }

    if (context.action === "storage.signUrl") {
      return { ok: true, output: { action: context.action, key, url: `artifact://${key}`, expiresIn: Number(input.expiresIn ?? 3600) } };
    }

    return { ok: false, error: `Unsupported storage action: ${context.action}` };
  }
}
