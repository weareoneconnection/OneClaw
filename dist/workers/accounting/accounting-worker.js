function asString(value) {
    return String(value ?? "").trim();
}
export class AccountingWorker {
    name = "accounting_worker";
    async execute(input, context) {
        await context.log(`AccountingWorker executing ${context.action}`);
        if (context.action === "finance.invoice.parse") {
            const path = asString(input.path);
            if (!path)
                return { ok: false, error: "finance.invoice.parse requires input.path" };
            return { ok: true, output: { provider: "accounting", action: context.action, status: "invoice_parse_prepared", path, fields: {} }, artifacts: [path] };
        }
        if (context.action === "finance.reconcile") {
            const source = asString(input.source);
            if (!source)
                return { ok: false, error: "finance.reconcile requires input.source" };
            return { ok: true, output: { provider: "accounting", action: context.action, status: "reconciliation_prepared", source, exceptions: [] } };
        }
        if (context.action === "finance.budget.review") {
            const budgetId = asString(input.budgetId || input.projectId);
            if (!budgetId)
                return { ok: false, error: "finance.budget.review requires input.budgetId or input.projectId" };
            return { ok: true, output: { provider: "accounting", action: context.action, status: "budget_review_prepared", budgetId, variances: [], approvalRequired: true } };
        }
        return { ok: false, error: `Unsupported accounting action: ${context.action}` };
    }
}
