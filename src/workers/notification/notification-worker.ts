import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class NotificationWorker implements Worker {
  readonly name = "notification_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`NotificationWorker executing ${context.action}`);
    const channel = asString(input.channel || "internal");
    const text = asString(input.text || input.message);
    if (!text) return { ok: false, error: `${context.action} requires input.text` };
    return { ok: true, output: { provider: "notification", action: context.action, status: "notification_prepared", channel, text } };
  }
}
