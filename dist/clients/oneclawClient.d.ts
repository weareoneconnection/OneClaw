export type OneClawAction = "api.request" | "api.webhook" | "browser.open" | "browser.screenshot" | "browser.extract" | "browser.click" | "browser.type" | "file.read" | "file.write" | "file.append" | "file.list" | "message.draft" | "message.notify" | "message.send" | "social.post" | "human.approval.request" | "human.confirmation.request" | "construction.task.create" | "construction.approval.request" | "construction.procurement.followup" | "construction.inspection.create" | "construction.hse.corrective_action" | "construction.qaqc.ncr.create" | "construction.rfi.create" | "construction.change_order.prepare" | "construction.schedule.recovery_plan" | "construction.contract.claim_prepare" | "construction.budget.variance_review";
export type OneClawTaskRequest = {
    taskName: string;
    approvalMode?: "auto" | "manual";
    steps: Array<{
        id: string;
        action: OneClawAction;
        input: Record<string, unknown>;
        dependsOn?: string[];
    }>;
};
export declare function executeOneClawTask(task: OneClawTaskRequest): Promise<unknown>;
export declare function executeOneClawAction(payload: {
    action: OneClawAction;
    approvalMode?: "auto" | "manual";
    input: Record<string, unknown>;
}): Promise<unknown>;
