import type { Express, Request, Response, NextFunction } from "express";
import type { AppServices } from "../../bootstrap.js";
import {
  actionExecutionSchema,
  taskDefinitionSchema,
  taskListSchema,
} from "../schemas.js";

export function registerTaskRoutes(app: Express, services: AppServices): void {
  app.get("/health", async (_req: Request, res: Response) => {
    try {
      return res.json({
        ok: true,
        service: "oneclaw-api",
        queueMode: services.config.queueMode,
        approvalMode: services.config.defaultApprovalMode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[/health] error =", error);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/v1/tasks/run", async (req: Request, res: Response) => {
    console.log("[route] /v1/tasks/run entered");
    console.log("[route] /v1/tasks/run body =", req.body);

    const parsed = taskDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[/v1/tasks/run] schema error =", parsed.error.flatten());
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      console.log("[/v1/tasks/run] before normalize");
      const normalized = services.planner.normalize(
        parsed.data,
        services.config.defaultApprovalMode,
      );
      console.log("[/v1/tasks/run] after normalize", {
        taskName: normalized.taskName,
        approvalMode: normalized.approvalMode,
        stepsCount: normalized.steps?.length ?? 0,
      });

      console.log("[/v1/tasks/run] before taskStore.create");
      const record = await services.taskStore.create({
        taskName: normalized.taskName,
        status: "queued",
        approvalMode: normalized.approvalMode,
        metadata: normalized.metadata,
        steps: [],
        logs: [],
      });
      console.log("[/v1/tasks/run] after taskStore.create", {
        taskId: record.id,
      });

      services.normalizedTaskStore.set(record.id, normalized);
      console.log("[/v1/tasks/run] after normalizedTaskStore.set", {
        taskId: record.id,
      });

      console.log("[/v1/tasks/run] before queue.enqueue", {
        queueMode: services.config.queueMode,
        taskId: record.id,
      });
      await services.queue.enqueue({ taskId: record.id, task: normalized });
      console.log("[/v1/tasks/run] after queue.enqueue", {
        taskId: record.id,
      });

      console.log("[/v1/tasks/run] before taskStore.get", {
        taskId: record.id,
      });
      const latest = await services.taskStore.get(record.id);
      console.log("[/v1/tasks/run] after taskStore.get", {
        taskId: record.id,
        found: Boolean(latest),
      });

      return res.status(202).json(latest);
    } catch (error) {
      console.error("[/v1/tasks/run] error =", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  });

  app.post("/v1/actions/execute", async (req: Request, res: Response) => {
    console.log("[route] /v1/actions/execute entered");
    console.log("[route] /v1/actions/execute body =", req.body);

    const parsed = actionExecutionSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[/v1/actions/execute] schema error =", parsed.error.flatten());
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      console.log("[/v1/actions/execute] before normalize");
      const normalized = services.planner.normalize(
        {
          taskName: `action:${parsed.data.action}`,
          approvalMode: parsed.data.approvalMode,
          steps: [
            {
              id: "step_1",
              action: parsed.data.action,
              input: parsed.data.input ?? {},
            },
          ],
        },
        services.config.defaultApprovalMode,
      );
      console.log("[/v1/actions/execute] after normalize", {
        taskName: normalized.taskName,
        approvalMode: normalized.approvalMode,
        stepsCount: normalized.steps?.length ?? 0,
      });

      console.log("[/v1/actions/execute] before taskStore.create");
      const record = await services.taskStore.create({
        taskName: normalized.taskName,
        status: "queued",
        approvalMode: normalized.approvalMode,
        metadata: normalized.metadata,
        steps: [],
        logs: [],
      });
      console.log("[/v1/actions/execute] after taskStore.create", {
        taskId: record.id,
      });

      services.normalizedTaskStore.set(record.id, normalized);
      console.log("[/v1/actions/execute] after normalizedTaskStore.set", {
        taskId: record.id,
      });

      console.log("[/v1/actions/execute] before queue.enqueue", {
        queueMode: services.config.queueMode,
        taskId: record.id,
      });
      await services.queue.enqueue({ taskId: record.id, task: normalized });
      console.log("[/v1/actions/execute] after queue.enqueue", {
        taskId: record.id,
      });

      console.log("[/v1/actions/execute] before taskStore.get", {
        taskId: record.id,
      });
      const latest = await services.taskStore.get(record.id);
      console.log("[/v1/actions/execute] after taskStore.get", {
        taskId: record.id,
        found: Boolean(latest),
      });

      return res.status(202).json(latest);
    } catch (error) {
      console.error("[/v1/actions/execute] error =", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  });

  app.get("/v1/tasks", async (req: Request, res: Response) => {
    console.log("[route] /v1/tasks entered");
    console.log("[route] /v1/tasks query =", req.query);

    const parsed = taskListSchema.safeParse(req.query);
    if (!parsed.success) {
      console.error("[/v1/tasks] schema error =", parsed.error.flatten());
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const items = await services.taskStore.list({
        limit: parsed.data.limit ?? 50,
      });
      const stats = await services.taskStore.getStats();

      return res.json({ items, stats });
    } catch (error) {
      console.error("[/v1/tasks] error =", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  });

  app.get("/v1/tasks/:id", async (req: Request, res: Response) => {
    console.log("[route] /v1/tasks/:id entered", req.params);

    try {
      const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const task = await services.taskStore.get(taskId);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      return res.json(task);
    } catch (error) {
      console.error("[/v1/tasks/:id] error =", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[express uncaught error] =", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return res.status(500).json({ error: message });
  });
}
