import { actionExecutionSchema, taskDefinitionSchema, taskListSchema } from "../schemas.js";
export function registerTaskRoutes(app, services) {
    app.post("/v1/tasks/run", async (req, res) => {
        const parsed = taskDefinitionSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        try {
            const normalized = services.planner.normalize(parsed.data, services.config.defaultApprovalMode);
            const record = await services.taskStore.create({
                taskName: normalized.taskName,
                status: "queued",
                approvalMode: normalized.approvalMode,
                metadata: normalized.metadata,
                steps: [],
                logs: [],
            });
            services.normalizedTaskStore.set(record.id, normalized);
            await services.queue.enqueue({ taskId: record.id, task: normalized });
            return res.status(202).json(await services.taskStore.get(record.id));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return res.status(400).json({ error: message });
        }
    });
    app.post("/v1/actions/execute", async (req, res) => {
        const parsed = actionExecutionSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        try {
            const normalized = services.planner.normalize({
                taskName: `action:${parsed.data.action}`,
                approvalMode: parsed.data.approvalMode,
                steps: [{ id: "step_1", action: parsed.data.action, input: parsed.data.input ?? {} }],
            }, services.config.defaultApprovalMode);
            const record = await services.taskStore.create({
                taskName: normalized.taskName,
                status: "queued",
                approvalMode: normalized.approvalMode,
                metadata: normalized.metadata,
                steps: [],
                logs: [],
            });
            services.normalizedTaskStore.set(record.id, normalized);
            await services.queue.enqueue({ taskId: record.id, task: normalized });
            return res.status(202).json(await services.taskStore.get(record.id));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return res.status(400).json({ error: message });
        }
    });
    app.get('/v1/tasks', async (req, res) => {
        const parsed = taskListSchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        return res.json({
            items: await services.taskStore.list({ limit: parsed.data.limit ?? 50 }),
            stats: await services.taskStore.getStats(),
        });
    });
    app.get("/v1/tasks/:id", async (req, res) => {
        const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const task = await services.taskStore.get(taskId);
        if (!task)
            return res.status(404).json({ error: "Task not found" });
        return res.json(task);
    });
}
