import { z } from "zod";
import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { taskDefinitionSchema } from "../schemas.js";

const scheduleCreateSchema = z.object({
  name: z.string().min(1),
  intervalMs: z.number().int().min(10_000),
  paused: z.boolean().optional(),
  task: taskDefinitionSchema,
});

export function registerSchedulerRoutes(app: Express, services: AppServices): void {
  function paramId(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : String(value ?? "");
  }

  app.get("/v1/schedules", (_req: Request, res: Response) => {
    res.json({ ok: true, items: services.scheduler.list() });
  });

  app.post("/v1/schedules", (req: Request, res: Response) => {
    if (!services.config.schedulerEnabled) {
      return res.status(403).json({ ok: false, error: "Scheduler is disabled." });
    }

    const parsed = scheduleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }

    const item = services.scheduler.create(parsed.data);
    return res.status(201).json({ ok: true, item });
  });

  app.post("/v1/schedules/:id/trigger", async (req: Request, res: Response) => {
    const item = await services.scheduler.trigger(paramId(req.params.id));
    if (!item) return res.status(404).json({ ok: false, error: "Schedule not found" });
    return res.json({ ok: true, item });
  });

  app.post("/v1/schedules/:id/pause", (req: Request, res: Response) => {
    const item = services.scheduler.updateStatus(paramId(req.params.id), "paused");
    if (!item) return res.status(404).json({ ok: false, error: "Schedule not found" });
    return res.json({ ok: true, item });
  });

  app.post("/v1/schedules/:id/resume", (req: Request, res: Response) => {
    const item = services.scheduler.updateStatus(paramId(req.params.id), "active");
    if (!item) return res.status(404).json({ ok: false, error: "Schedule not found" });
    return res.json({ ok: true, item });
  });
}
