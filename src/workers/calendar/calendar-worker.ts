import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class CalendarWorker implements Worker {
  readonly name = "calendar_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`CalendarWorker executing ${context.action}`);
    const title = asString(input.title || input.summary);

    if (context.action === "calendar.event.create") {
      const start = asString(input.start);
      const end = asString(input.end);
      if (!title || !start) return { ok: false, error: "calendar.event.create requires input.title and input.start" };
      return { ok: true, output: { provider: "calendar", action: context.action, status: "event_prepared", title, start, end } };
    }

    if (context.action === "calendar.availability.check") {
      const date = asString(input.date);
      return { ok: true, output: { provider: "calendar", action: context.action, status: "availability_prepared", date, slots: [] } };
    }

    if (context.action === "calendar.event.update") {
      const eventId = asString(input.eventId);
      if (!eventId) return { ok: false, error: "calendar.event.update requires input.eventId" };
      return { ok: true, output: { provider: "calendar", action: context.action, status: "update_prepared", eventId, title } };
    }

    return { ok: false, error: `Unsupported calendar action: ${context.action}` };
  }
}
