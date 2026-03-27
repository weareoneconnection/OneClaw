export function registerHealthRoutes(app, services) {
    app.get("/health", (_req, res) => {
        res.json({
            ok: true,
            service: "oneclaw-v5",
            queueMode: services.config.queueMode,
            queueBackend: services.queue.mode,
        });
    });
}
