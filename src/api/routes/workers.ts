import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";

export function registerWorkerRoutes(app: Express, services: AppServices): void {
  app.get("/v1/workers", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      workers: services.workers.list().map((worker) => ({
        name: worker.name,
        status: "registered",
      })),
    });
  });
}
