import { HttpAdapter } from "../../adapters/http/http-adapter.js";
import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asOptionalStringRecord(
  value: Json | undefined,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || item === null) continue;
    result[String(key)] = String(item);
  }

  return Object.keys(result).length ? result : undefined;
}

function asQueryRecord(
  value: Json | undefined,
): Record<string, string | number | boolean | null | undefined> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, string | number | boolean | null | undefined> =
    {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      item === null ||
      item === undefined ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[String(key)] = item as
        | string
        | number
        | boolean
        | null
        | undefined;
    } else {
      result[String(key)] = String(item);
    }
  }

  return Object.keys(result).length ? result : undefined;
}

function asPositiveNumber(value: Json | undefined): number | undefined {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return undefined;
}

export class ApiWorker implements Worker {
  readonly name = "api_worker";

  constructor(private readonly httpAdapter: HttpAdapter) {}

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`ApiWorker executing ${context.action}`);

    try {
      const url = asString(input.url);
      if (!url) {
        return {
          ok: false,
          error: "api.request requires input.url",
        };
      }

      const method = asString(input.method || "GET").toUpperCase();
      const headers = asOptionalStringRecord(input.headers);
      const query = asQueryRecord(input.query);
      const timeoutMs = asPositiveNumber(input.timeoutMs);
      const body = input.body;

      await context.log(
        `ApiWorker request method=${method} url=${url}`,
      );

      const response = await this.httpAdapter.request(url, {
        method,
        headers,
        query,
        timeoutMs,
        body,
      });

      await context.log(
        `ApiWorker response status=${response.status} ok=${response.ok}`,
      );

      return {
        ok: true,
        output: {
          action: context.action,
          method,
          url: response.url,
          status: response.status,
          ok: response.ok,
          headers: response.headers as Json,
          body: response.body,
          response: {
            status: response.status,
            ok: response.ok,
            url: response.url,
            headers: response.headers as Json,
            body: response.body,
          },
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "API worker failed";

      await context.log(`ApiWorker failed: ${message}`);

      return {
        ok: false,
        error: message,
      };
    }
  }
}