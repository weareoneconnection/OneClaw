import type { Express, Request, Response } from "express";
import type { AppServices } from "../../bootstrap.js";
import { approvalDecisionSchema } from "../schemas.js";

function asSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function registerApprovalRoutes(app: Express, services: AppServices): void {
  app.get("/v1/approvals/pending", async (_req: Request, res: Response) => {
    return res.json(await services.taskStore.listPendingApprovals());
  });

  app.get("/v1/approvals/:id", async (req: Request, res: Response) => {
    const approvalId = asSingleParam(req.params.id);
    const approval = await services.taskStore.getApproval(approvalId);
    if (!approval) return res.status(404).json({ error: "Approval not found" });
    return res.json(approval);
  });

  app.post("/v1/approvals/:id/approve", async (req: Request, res: Response) => {
    const parsed = approvalDecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const approvalId = asSingleParam(req.params.id);

    try {
      const approval = await services.taskStore.decideApproval({
        approvalId,
        status: "approved",
        decidedBy: parsed.data.decidedBy,
        decisionNote: parsed.data.decisionNote,
      });

      const task = await services.taskStore.get(approval.taskId);
      const normalized = services.normalizedTaskStore.get(approval.taskId);

      if (!task || !normalized) {
        return res.status(404).json({ error: "Task or normalized workflow not found" });
      }

      await services.queue.enqueue({ taskId: approval.taskId, task: normalized });

      return res.json({
        approval,
        task: await services.taskStore.get(approval.taskId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  });

  app.post("/v1/approvals/:id/reject", async (req: Request, res: Response) => {
    const parsed = approvalDecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const approvalId = asSingleParam(req.params.id);

    try {
      const approval = await services.taskStore.decideApproval({
        approvalId,
        status: "rejected",
        decidedBy: parsed.data.decidedBy,
        decisionNote: parsed.data.decisionNote,
      });

      await services.taskStore.upsertStep(approval.taskId, {
        stepId: approval.stepId,
        action: approval.action,
        status: "rejected",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: parsed.data.decisionNote ?? approval.reason,
      });

      await services.taskStore.update(approval.taskId, (task) => ({
        ...task,
        status: "rejected",
      }));

      return res.json({
        approval,
        task: await services.taskStore.get(approval.taskId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  });
}