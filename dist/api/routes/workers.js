export function registerWorkerRoutes(app, services) {
    app.get("/v1/workers", (_req, res) => {
        res.json({
            ok: true,
            workers: services.workers.list().map((worker) => ({
                name: worker.name,
                status: "registered",
                bridgeRole: worker.name === "rpa_worker" ? "local_desktop_bridge" : undefined,
            })),
        });
    });
}
