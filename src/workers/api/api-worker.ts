import { HttpAdapter } from "../../adapters/http/http-adapter.js";
import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

export class ApiWorker implements Worker {
  readonly name = "api_worker";

  constructor(private readonly httpAdapter: HttpAdapter) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    context.log(`ApiWorker executing ${context.action}`);
    const url = String(input.url ?? "");
    if (!url) return { ok: false, error: "api.request requires input.url" };

    const method = String(input.method ?? "GET");
    const response = await this.httpAdapter.request(url, method, input.body);

    return {
      ok: true,
      output: {
        action: context.action,
        response,
      },
    };
  }
}
