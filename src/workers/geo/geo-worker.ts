import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class GeoWorker implements Worker {
  readonly name = "geo_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`GeoWorker executing ${context.action}`);

    if (context.action === "geo.geocode") {
      const address = asString(input.address);
      if (!address) return { ok: false, error: "geo.geocode requires input.address" };
      return { ok: true, output: { provider: "geo", action: context.action, status: "geocode_prepared", address, coordinates: null } };
    }

    if (context.action === "geo.route.plan") {
      const origin = asString(input.origin);
      const destination = asString(input.destination);
      if (!origin || !destination) return { ok: false, error: "geo.route.plan requires input.origin and input.destination" };
      return { ok: true, output: { provider: "geo", action: context.action, status: "route_prepared", origin, destination, route: null } };
    }

    if (context.action === "geo.site.map") {
      const siteId = asString(input.siteId || input.projectId);
      if (!siteId) return { ok: false, error: "geo.site.map requires input.siteId or input.projectId" };
      return { ok: true, output: { provider: "geo", action: context.action, status: "site_map_prepared", siteId, layers: [] } };
    }

    return { ok: false, error: `Unsupported geo action: ${context.action}` };
  }
}
