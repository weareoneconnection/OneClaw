import express from "express";
import type { AppServices } from "../bootstrap.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAdminRoutes } from './routes/admin.js';
import { registerCapabilityRoutes } from "./routes/capabilities.js";
import { registerPreflightRoutes } from "./routes/preflight.js";
import { registerSchedulerRoutes } from "./routes/scheduler.js";
import { registerSubtaskRoutes } from "./routes/subtasks.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerWorkerRoutes } from "./routes/workers.js";
import { registerReplayRoutes } from "./routes/replay.js";

export function createServer(services: AppServices) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  registerHealthRoutes(app, services);
  registerTaskRoutes(app, services);
  registerApprovalRoutes(app, services);
  registerCapabilityRoutes(app, services);
  registerPreflightRoutes(app, services);
  registerSchedulerRoutes(app, services);
  registerSubtaskRoutes(app, services);
  registerConnectorRoutes(app, services);
  registerWorkerRoutes(app, services);
  registerReplayRoutes(app, services);
  registerAdminRoutes(app, services);
  return app;
}
