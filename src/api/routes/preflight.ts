import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { taskDefinitionSchema } from "../schemas.js";

export function registerPreflightRoutes(app: Express, services: AppServices): void {
  app.post("/v1/preflight", (req: Request, res: Response) => {
    const parsed = taskDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }

    const normalized = services.planner.normalize(parsed.data, services.config.defaultApprovalMode);
    const report = services.preflight.evaluate(normalized);
    return res.status(report.ok ? 200 : 422).json({ ok: report.ok, report });
  });
}
