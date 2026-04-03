import fetch, { Headers } from "node-fetch";
import type { Json } from "../../types/task.js";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD";

export interface HttpRequestOptions {
  method?: HttpMethod | string;
  headers?: Record<string, string>;
  body?: Json;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
}

export interface HttpResponseData {
  status: number;
  ok: boolean;
  url: string;
  headers: Record<string, string>;
  body: Json | string;
}

function asMethod(value: string | undefined): HttpMethod {
  const method = String(value ?? "GET").trim().toUpperCase();

  switch (method) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "HEAD":
      return method;
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }
}

function buildUrl(
  rawUrl: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = new URL(rawUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }

  return result;
}

function shouldSendBody(method: HttpMethod): boolean {
  return method !== "GET" && method !== "HEAD";
}

export class HttpAdapter {
  constructor(
    private readonly defaults: {
      timeoutMs?: number;
      userAgent?: string;
      headers?: Record<string, string>;
    } = {},
  ) {}

  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponseData> {
    const targetUrl = String(url ?? "").trim();
    if (!targetUrl) {
      throw new Error("HTTP request url is required");
    }

    const method = asMethod(options.method);
    const finalUrl = buildUrl(targetUrl, options.query);

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.defaults.timeoutMs ?? 15000;

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const headers: Record<string, string> = {
        "User-Agent": this.defaults.userAgent ?? "OneClaw/0.2",
        ...(this.defaults.headers ?? {}),
        ...(options.headers ?? {}),
      };

      let requestBody: string | undefined;

      if (shouldSendBody(method) && options.body !== undefined) {
        requestBody = JSON.stringify(options.body);

        if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
          headers["Content-Type"] = "application/json";
        }
      }

      const response = await fetch(finalUrl, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const responseHeaders = normalizeHeaders(response.headers);

      let body: Json | string;

      if (contentType.includes("application/json")) {
        body = (await response.json()) as Json;
      } else {
        body = await response.text();
      }

      return {
        status: response.status,
        ok: response.ok,
        url: response.url,
        headers: responseHeaders,
        body,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`HTTP request timed out after ${timeoutMs}ms: ${finalUrl}`);
      }

      throw error instanceof Error
        ? new Error(`HTTP request failed: ${error.message}`)
        : new Error("HTTP request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  async get(
    url: string,
    options: Omit<HttpRequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponseData> {
    return this.request(url, {
      ...options,
      method: "GET",
    });
  }

  async post(
    url: string,
    body?: Json,
    options: Omit<HttpRequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponseData> {
    return this.request(url, {
      ...options,
      method: "POST",
      body,
    });
  }

  async put(
    url: string,
    body?: Json,
    options: Omit<HttpRequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponseData> {
    return this.request(url, {
      ...options,
      method: "PUT",
      body,
    });
  }

  async patch(
    url: string,
    body?: Json,
    options: Omit<HttpRequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponseData> {
    return this.request(url, {
      ...options,
      method: "PATCH",
      body,
    });
  }

  async delete(
    url: string,
    options: Omit<HttpRequestOptions, "method" | "body"> = {},
  ): Promise<HttpResponseData> {
    return this.request(url, {
      ...options,
      method: "DELETE",
    });
  }
}
