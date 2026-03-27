import fs from "node:fs/promises";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

export class FileWorker implements Worker {
  readonly name = "file_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    context.log(`FileWorker executing ${context.action}`);
    try {
      if (context.action === "file.read") {
        const filePath = String(input.path ?? "");
        if (!filePath) return { ok: false, error: "file.read requires input.path" };
        const content = await fs.readFile(filePath, "utf8");
        return { ok: true, output: { action: context.action, path: filePath, content } };
      }

      if (context.action === "file.write") {
        const filePath = String(input.path ?? "");
        if (!filePath) return { ok: false, error: "file.write requires input.path" };
        const content = String(input.content ?? "");
        await fs.writeFile(filePath, content, "utf8");
        return { ok: true, output: { action: context.action, path: filePath, bytes: Buffer.byteLength(content) } };
      }

      return { ok: false, error: `Unsupported file action: ${context.action}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown file error" };
    }
  }
}
