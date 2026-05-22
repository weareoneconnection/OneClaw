import { getConnectorReadiness } from "../../connectors/connector-readiness.js";
function asId(value) {
    return Array.isArray(value) ? value[0] : String(value ?? "");
}
export function registerConnectorRoutes(app, services) {
    app.get("/v1/connectors", (_req, res) => {
        res.json({ ok: true, connectors: getConnectorReadiness(services.config) });
    });
    app.get("/v1/connectors/:key/test", (req, res) => {
        const key = asId(req.params.key);
        const connector = getConnectorReadiness(services.config).find((item) => item.key === key);
        if (!connector)
            return res.status(404).json({ ok: false, error: "Connector not found" });
        return res.json({
            ok: connector.status === "connected" || connector.status === "dry_run" || connector.status === "prepared",
            connector,
            testedAt: new Date().toISOString(),
        });
    });
}
