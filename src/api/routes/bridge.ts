import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { getBridgeDiagnostics, getBridgeRegistration, getBridgeStatus } from "../../bridge/desktop-bridge.js";

export function registerBridgeRoutes(app: Express, services: AppServices): void {
  app.get("/v1/bridge/status", (_req: Request, res: Response) => {
    res.json(getBridgeStatus(services.config));
  });

  app.get("/v1/bridge/diagnostics", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      diagnostics: getBridgeDiagnostics(services.config),
    });
  });

  app.get("/v1/bridge/registration", (_req: Request, res: Response) => {
    res.json(getBridgeRegistration(services.config, services.capabilities.manifest()));
  });

  app.post("/v1/bridge/register", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      mode: "prepared",
      registration: getBridgeRegistration(services.config, services.capabilities.manifest()),
      note: "Local bridge registration payload is ready. Cloud relay handshake is reserved for the next stage.",
    });
  });
}
