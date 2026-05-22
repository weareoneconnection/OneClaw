function asId(value) {
    return Array.isArray(value) ? value[0] : String(value ?? "");
}
export function registerReplayRoutes(app, services) {
    app.post("/v1/tasks/:id/replay", async (req, res) => {
        const taskId = asId(req.params.id);
        const task = await services.taskStore.get(taskId);
        if (!task)
            return res.status(404).json({ ok: false, error: "Task not found" });
        const normalized = services.normalizedTaskStore.get(taskId)
            ?? task.metadata?.normalizedTask;
        if (!normalized) {
            return res.status(409).json({ ok: false, error: "Normalized task is not available for replay." });
        }
        const fromStepId = typeof req.body?.fromStepId === "string" ? req.body.fromStepId : undefined;
        const replayTask = fromStepId
            ? { ...normalized, steps: normalized.steps.filter((step) => step.id === fromStepId || step.dependsOn?.includes(fromStepId)) }
            : normalized;
        const report = services.preflight.evaluate(replayTask);
        if (!report.ok)
            return res.status(422).json({ ok: false, report });
        const record = await services.taskStore.create({
            taskName: `${normalized.taskName}:replay`,
            status: "queued",
            approvalMode: normalized.approvalMode,
            metadata: {
                ...(normalized.metadata ?? {}),
                replayOf: taskId,
                normalizedTask: replayTask,
            },
            steps: [],
            logs: [],
        });
        services.normalizedTaskStore.set(record.id, replayTask);
        await services.queue.enqueue({ taskId: record.id, task: replayTask });
        return res.status(202).json({ ok: true, replayTaskId: record.id, task: await services.taskStore.get(record.id) });
    });
}
