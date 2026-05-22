import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { getConnectorReadiness } from "../../connectors/connector-readiness.js";

function asId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : String(value ?? "");
}

export function registerConnectorRoutes(app: Express, services: AppServices): void {
  app.get("/v1/connectors", (_req: Request, res: Response) => {
    res.json({ ok: true, connectors: getConnectorReadiness(services.config) });
  });

  app.get("/v1/connectors/:key/test", (req: Request, res: Response) => {
    const key = asId(req.params.key);
    const connector = getConnectorReadiness(services.config).find((item) => item.key === key);
    if (!connector) return res.status(404).json({ ok: false, error: "Connector not found" });
    return res.json({
      ok: connector.status === "connected" || connector.status === "dry_run" || connector.status === "prepared",
      connector,
      testedAt: new Date().toISOString(),
    });
  });
}
