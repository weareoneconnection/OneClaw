import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { getConnectorReadiness, summarizeMaturity } from "../../connectors/connector-readiness.js";

export function registerCapabilityRoutes(app: Express, services: AppServices): void {
  app.get("/v1/capabilities", (_req: Request, res: Response) => {
    const capabilities = services.capabilities.manifest();
    const connectors = getConnectorReadiness(services.config);
    res.json({
      ok: true,
      service: "oneclaw",
      version: "capability-manifest.v1",
      maturity: summarizeMaturity(capabilities),
      capabilities,
      connectors,
      plugins: services.plugins ?? [],
    });
  });
}
