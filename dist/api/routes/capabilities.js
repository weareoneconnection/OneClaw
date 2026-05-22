import { getConnectorReadiness, summarizeMaturity } from "../../connectors/connector-readiness.js";
export function registerCapabilityRoutes(app, services) {
    app.get("/v1/capabilities", (_req, res) => {
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
