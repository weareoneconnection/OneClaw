import fs from "node:fs/promises";
import path from "node:path";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class DocumentWorker implements Worker {
  readonly name = "document_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`DocumentWorker executing ${context.action}`);
    const filePath = asString(input.path);

    if (context.action === "document.parse") {
      if (!filePath) return { ok: false, error: "document.parse requires input.path" };
      const content = await fs.readFile(filePath, "utf8");
      return { ok: true, output: { action: context.action, path: filePath, text: content, bytes: Buffer.byteLength(content) }, artifacts: [filePath] };
    }

    if (context.action === "document.generate") {
      const title = asString(input.title || "Untitled");
      const content = asString(input.content || input.text);
      if (!filePath || !content) return { ok: false, error: "document.generate requires input.path and input.content" };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const body = `# ${title}\n\n${content}\n`;
      await fs.writeFile(filePath, body, "utf8");
      return { ok: true, output: { action: context.action, path: filePath, title, bytes: Buffer.byteLength(body) }, artifacts: [filePath] };
    }

    if (context.action === "document.convert") {
      return { ok: true, output: { action: context.action, status: "conversion_planned", source: filePath, target: asString(input.targetPath) } };
    }

    return { ok: false, error: `Unsupported document action: ${context.action}` };
  }
}
