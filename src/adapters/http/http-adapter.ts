import fetch from "node-fetch";
import type { Json } from "../../types/task.js";

export class HttpAdapter {
  async request(url: string, method: string, body?: Json): Promise<{ status: number; body: Json | string }> {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "OneClaw/0.2",
      },
      body: body === undefined || method.toUpperCase() === "GET" ? undefined : JSON.stringify(body),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return { status: response.status, body: (await response.json()) as Json };
    }

    return { status: response.status, body: await response.text() };
  }
}
