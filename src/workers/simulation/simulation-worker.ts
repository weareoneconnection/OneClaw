import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class SimulationWorker implements Worker {
  readonly name = "simulation_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`SimulationWorker executing ${context.action}`);
    const projectId = asString(input.projectId || input.modelId);

    if (context.action === "simulation.schedule.run") {
      if (!projectId) return { ok: false, error: "simulation.schedule.run requires input.projectId" };
      return { ok: true, output: { provider: "simulation", action: context.action, status: "schedule_simulation_prepared", projectId, scenarios: [] } };
    }

    if (context.action === "simulation.cost.forecast") {
      if (!projectId) return { ok: false, error: "simulation.cost.forecast requires input.projectId" };
      return { ok: true, output: { provider: "simulation", action: context.action, status: "cost_forecast_prepared", projectId, forecast: null } };
    }

    if (context.action === "digitalTwin.state.sync") {
      if (!projectId) return { ok: false, error: "digitalTwin.state.sync requires input.projectId or input.modelId" };
      return { ok: true, output: { provider: "digital_twin", action: context.action, status: "twin_sync_prepared", projectId, approvalRequired: true } };
    }

    return { ok: false, error: `Unsupported simulation action: ${context.action}` };
  }
}
