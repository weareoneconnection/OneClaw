import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asRecord(value: Json | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Json>;
}

export class HumanWorker implements Worker {
  readonly name = "human_worker";

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`HumanWorker executing ${context.action}`);

    const title =
      asString(input.title) ||
      asString(input.subject) ||
      (context.action === "human.confirmation.request"
        ? "Human confirmation requested"
        : "Human approval requested");
    const reason =
      asString(input.reason) ||
      asString(input.note) ||
      asString(input.description) ||
      asString(input.text) ||
      asString(input.message);

    if (!reason) {
      return {
        ok: false,
        error: `${context.action} requires input.reason, input.note, or input.description`,
      };
    }

    return {
      ok: true,
      output: {
        provider: "human",
        action: context.action,
        title,
        reason,
        requesterRole: asString(input.requesterRole || "system"),
        approverRole: asString(input.approverRole || "owner"),
        priority: asString(input.priority || "high"),
        status:
          context.action === "human.confirmation.request"
            ? "confirmation_requested"
            : "approval_requested",
        payload: asRecord(input.payload),
      },
    };
  }
}
