import type { AppConfig } from "../../config.js";
import { HttpAdapter } from "../../adapters/http/http-adapter.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class SearchWorker implements Worker {
  readonly name = "search_worker";

  constructor(
    private readonly config: AppConfig,
    private readonly httpAdapter: HttpAdapter,
  ) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`SearchWorker executing ${context.action}`);
    const query = asString(input.query);
    if (!query) return { ok: false, error: `${context.action} requires input.query` };

    if (!this.config.searchEndpoint) {
      return { ok: true, output: { provider: "search", action: context.action, status: "search_prepared", query, results: [] } };
    }

    const response = await this.httpAdapter.request(this.config.searchEndpoint, {
      method: "GET",
      query: { q: query },
    });
    return { ok: true, output: { provider: "search", action: context.action, query, response: response.body } };
  }
}
