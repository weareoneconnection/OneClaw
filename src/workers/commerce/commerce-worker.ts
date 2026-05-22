import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class CommerceWorker implements Worker {
  readonly name = "commerce_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`CommerceWorker executing ${context.action}`);
    const provider = asString(input.provider || "generic");

    if (context.action === "commerce.product.search") {
      const query = asString(input.query);
      if (!query) return { ok: false, error: "commerce.product.search requires input.query" };
      return { ok: true, output: { provider, action: context.action, status: "search_prepared", query, products: [] } };
    }

    if (context.action === "commerce.order.prepare") {
      const item = asString(input.item || input.sku);
      if (!item) return { ok: false, error: "commerce.order.prepare requires input.item or input.sku" };
      return { ok: true, output: { provider, action: context.action, status: "order_prepared", item, quantity: Number(input.quantity ?? 1), approvalRequired: true } };
    }

    if (context.action === "payment.invoice.create") {
      const customer = asString(input.customer);
      if (!customer) return { ok: false, error: "payment.invoice.create requires input.customer" };
      return { ok: true, output: { provider, action: context.action, status: "invoice_prepared", customer, amount: input.amount ?? null, approvalRequired: true } };
    }

    if (context.action === "payment.charge.prepare") {
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "payment.charge.prepare requires positive input.amount" };
      return { ok: true, output: { provider, action: context.action, status: "charge_prepared", amount, currency: asString(input.currency || "USD"), approvalRequired: true } };
    }

    return { ok: false, error: `Unsupported commerce action: ${context.action}` };
  }
}
