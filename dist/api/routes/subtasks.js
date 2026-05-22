import { taskDefinitionSchema } from "../schemas.js";
export function registerSubtaskRoutes(app, services) {
    app.post("/v1/subtasks/run", async (req, res) => {
        const parsed = taskDefinitionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: parsed.error.flatten() });
        }
        const normalized = services.planner.normalize({
            ...parsed.data,
            metadata: {
                ...(parsed.data.metadata ?? {}),
                executionKind: "subtask",
                isolated: true,
            },
        }, services.config.defaultApprovalMode);
        const report = services.preflight.evaluate(normalized);
        if (!report.ok)
            return res.status(422).json({ ok: false, report });
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
        return res.status(202).json({ ok: true, taskId: record.id, report, task: await services.taskStore.get(record.id) });
    });
}
