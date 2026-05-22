import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class IdentityWorker implements Worker {
  readonly name = "identity_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`IdentityWorker executing ${context.action}`);

    if (context.action === "identity.resolve") {
      const subject = asString(input.subject || input.userId || input.email);
      if (!subject) return { ok: false, error: "identity.resolve requires input.subject" };
      return { ok: true, output: { provider: "identity", action: context.action, subject, status: "resolved", roles: [] } };
    }

    if (context.action === "secret.check") {
      const key = asString(input.key);
      if (!key) return { ok: false, error: "secret.check requires input.key" };
      return { ok: true, output: { provider: "secret", action: context.action, key, configured: Boolean(process.env[key]) } };
    }

    if (context.action === "permission.check") {
      return { ok: true, output: { provider: "identity", action: context.action, status: "permission_prepared", allowed: false } };
    }

    return { ok: false, error: `Unsupported identity action: ${context.action}` };
  }
}
