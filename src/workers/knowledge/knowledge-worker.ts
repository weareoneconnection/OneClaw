import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

export class KnowledgeWorker implements Worker {
  readonly name = "knowledge_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`KnowledgeWorker executing ${context.action}`);
    const namespace = asString(input.namespace || "default");

    if (context.action === "knowledge.upsert") {
      const id = asString(input.id);
      const text = asString(input.text || input.content);
      if (!id || !text) return { ok: false, error: "knowledge.upsert requires input.id and input.text" };
      return { ok: true, output: { provider: "knowledge", action: context.action, status: "upsert_prepared", namespace, id, text } };
    }

    if (context.action === "knowledge.query") {
      const query = asString(input.query);
      if (!query) return { ok: false, error: "knowledge.query requires input.query" };
      return { ok: true, output: { provider: "knowledge", action: context.action, status: "query_prepared", namespace, query, results: [] } };
    }

    if (context.action === "vector.upsert") {
      const id = asString(input.id);
      const vector = asArray(input.vector);
      if (!id || !vector.length) return { ok: false, error: "vector.upsert requires input.id and input.vector" };
      return { ok: true, output: { provider: "vector", action: context.action, status: "vector_upsert_prepared", namespace, id, dimensions: vector.length } };
    }

    if (context.action === "vector.query") {
      const query = asString(input.query);
      const vector = asArray(input.vector);
      if (!query && !vector.length) return { ok: false, error: "vector.query requires input.query or input.vector" };
      return { ok: true, output: { provider: "vector", action: context.action, status: "vector_query_prepared", namespace, query, dimensions: vector.length, results: [] } };
    }

    return { ok: false, error: `Unsupported knowledge action: ${context.action}` };
  }
}
