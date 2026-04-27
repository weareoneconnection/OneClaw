import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asPriority(value: Json | undefined): string {
  const priority = asString(value || "medium").toLowerCase();
  if (["low", "medium", "high", "critical"].includes(priority)) {
    return priority;
  }
  return "medium";
}

function asRecord(value: Json | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Json>;
}

function toConstructionType(action: string): string {
  return action.replace(/^construction\./, "").replace(/\./g, "_");
}

export class ConstructionWorker implements Worker {
  readonly name = "construction_worker";

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`ConstructionWorker executing ${context.action}`);

    const title =
      asString(input.title) ||
      asString(input.name) ||
      toConstructionType(context.action);
    const note =
      asString(input.note) ||
      asString(input.description) ||
      `OneClaw prepared construction action: ${title}`;
    const projectId = asString(input.projectId);
    const organizationId = asString(input.organizationId);
    const actorUserId = asString(input.actorUserId);
    const priority = asPriority(input.priority);
    const payload = asRecord(input.payload);
    const actionType = toConstructionType(context.action);

    if (context.action === "construction.approval.request" && !note) {
      return {
        ok: false,
        error: "construction.approval.request requires input.note or input.description",
      };
    }

    await context.log(
      `ConstructionWorker planned type=${actionType} priority=${priority}`,
    );

    return {
      ok: true,
      output: {
        provider: "construction_os",
        action: context.action,
        actionType,
        projectId: projectId || null,
        organizationId: organizationId || null,
        actorUserId: actorUserId || null,
        title,
        note,
        priority,
        source: asString(input.source || "oneai"),
        approvalRequested:
          context.action === "construction.approval.request" ||
          priority === "critical",
        tracked: true,
        payload,
      },
    };
  }
}
