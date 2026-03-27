import path from 'node:path';
import express from 'express';
function requireAdminToken(services, req, res, next) {
    const configured = services.config.adminToken;
    if (!configured)
        return next();
    const provided = req.header('x-oneclaw-admin-token') ?? req.query.token;
    if (provided !== configured)
        return res.status(401).json({ error: 'Unauthorized' });
    return next();
}
export function registerAdminRoutes(app, services) {
    const publicDir = path.resolve('src/admin/public');
    app.get('/admin/api/overview', (req, res, next) => requireAdminToken(services, req, res, next), async (_req, res) => {
        return res.json({
            stats: await services.taskStore.getStats(),
            approvals: await services.taskStore.listPendingApprovals(),
            tasks: await services.taskStore.list({ limit: 20 }),
        });
    });
    app.use('/admin/assets', express.static(publicDir));
    app.get('/admin', (_req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });
}
