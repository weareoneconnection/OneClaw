import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { getBridgeStatus } from "../../bridge/desktop-bridge.js";

export function registerHealthRoutes(app: Express, services: AppServices): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "oneclaw-v5",
      queueMode: services.config.queueMode,
      queueBackend: services.queue.mode,
      bridge: getBridgeStatus(services.config).bridge,
    });
  });
}
