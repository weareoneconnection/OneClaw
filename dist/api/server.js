import express from "express";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAdminRoutes } from './routes/admin.js';
export function createServer(services) {
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    registerHealthRoutes(app, services);
    registerTaskRoutes(app, services);
    registerApprovalRoutes(app, services);
    registerAdminRoutes(app, services);
    return app;
}
