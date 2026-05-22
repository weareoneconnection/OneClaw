import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asStringList(value: Json | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const single = asString(value);
  return single ? [single] : [];
}

export class EmailWorker implements Worker {
  readonly name = "email_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`EmailWorker executing ${context.action}`);

    const to = asStringList(input.to);
    const subject = asString(input.subject);
    const body = asString(input.body || input.text);

    if (context.action === "email.draft") {
      if (!subject || !body) return { ok: false, error: "email.draft requires input.subject and input.body" };
      return { ok: true, output: { provider: "email", action: context.action, status: "drafted", to, subject, body } };
    }

    if (context.action === "email.send") {
      if (!to.length || !subject || !body) return { ok: false, error: "email.send requires input.to, input.subject, and input.body" };
      return {
        ok: true,
        output: {
          provider: "email",
          action: context.action,
          status: "send_prepared",
          delivery: "connector_required",
          to,
          subject,
          body,
        },
      };
    }

    if (context.action === "email.search") {
      const query = asString(input.query);
      if (!query) return { ok: false, error: "email.search requires input.query" };
      return { ok: true, output: { provider: "email", action: context.action, status: "search_prepared", query, items: [] } };
    }

    return { ok: false, error: `Unsupported email action: ${context.action}` };
  }
}
