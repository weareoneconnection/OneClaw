import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class LegalWorker implements Worker {
  readonly name = "legal_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`LegalWorker executing ${context.action}`);
    const text = asString(input.text || input.content);
    const path = asString(input.path);

    if (context.action === "legal.contract.extract") {
      if (!text && !path) return { ok: false, error: "legal.contract.extract requires input.text or input.path" };
      return { ok: true, output: { provider: "legal", action: context.action, status: "contract_extract_prepared", path, clauses: [] }, artifacts: path ? [path] : [] };
    }

    if (context.action === "legal.risk.review") {
      if (!text && !path) return { ok: false, error: "legal.risk.review requires input.text or input.path" };
      return { ok: true, output: { provider: "legal", action: context.action, status: "risk_review_prepared", path, risks: [], approvalRequired: true }, artifacts: path ? [path] : [] };
    }

    if (context.action === "legal.approval.package") {
      const title = asString(input.title);
      if (!title) return { ok: false, error: "legal.approval.package requires input.title" };
      return { ok: true, output: { provider: "legal", action: context.action, status: "approval_package_prepared", title, approvalRequired: true } };
    }

    return { ok: false, error: `Unsupported legal action: ${context.action}` };
  }
}
