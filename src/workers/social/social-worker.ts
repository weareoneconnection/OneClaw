import fs from "node:fs";
import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { XAdapter } from "../../adapters/x/x-adapter.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asOptionalString(value: Json | undefined): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function asStringArray(value: Json | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);

  if (!items.length) return undefined;

  return Array.from(new Set(items));
}

function isValidTweetId(value: string): boolean {
  return /^[0-9]{1,19}$/.test(value);
}

function truncateForLog(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export class SocialWorker implements Worker {
  readonly name = "social_worker";

  constructor(private readonly xAdapter: XAdapter) {}

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    const action = asString(context.action).toLowerCase();
    const channel = asString(input.channel || "x").toLowerCase();

    await context.log(
      `SocialWorker executing action=${action || "unknown"} channel=${channel}`,
    );

    try {
      if (action !== "social.post") {
        return {
          ok: false,
          error: `Unsupported social action: ${action || "unknown"}`,
        };
      }

      if (channel !== "x") {
        return {
          ok: false,
          error: `Unsupported social channel: ${channel}`,
        };
      }

      const content = asString(input.content);
      if (!content) {
        return {
          ok: false,
          error: "Missing social content",
        };
      }

      if (content.length > 280) {
        return {
          ok: false,
          error: `Social content too long: ${content.length} characters (max 280)`,
        };
      }

      const replyToTweetId = asOptionalString(input.replyToTweetId);
      if (replyToTweetId && !isValidTweetId(replyToTweetId)) {
        return {
          ok: false,
          error:
            "Invalid replyToTweetId: must be a numeric tweet ID (1-19 digits)",
        };
      }

      const mediaPaths = asStringArray(input.mediaPaths);

      if (mediaPaths && mediaPaths.length > 4) {
        return {
          ok: false,
          error: `Too many media files: ${mediaPaths.length} (max 4)`,
        };
      }

      if (mediaPaths?.length) {
        for (const mediaPath of mediaPaths) {
          if (!fs.existsSync(mediaPath)) {
            return {
              ok: false,
              error: `Media file not found: ${mediaPath}`,
            };
          }

          const stat = fs.statSync(mediaPath);
          if (!stat.isFile()) {
            return {
              ok: false,
              error: `Media path is not a file: ${mediaPath}`,
            };
          }

          if (stat.size <= 0) {
            return {
              ok: false,
              error: `Media file is empty: ${mediaPath}`,
            };
          }
        }
      }

      await context.log(
        `SocialWorker preparing X post textLength=${content.length} mediaCount=${mediaPaths?.length ?? 0} reply=${replyToTweetId ? "yes" : "no"} preview=${truncateForLog(content, 80)}`,
      );

      const response = await this.xAdapter.createPost({
        text: content,
        replyToTweetId,
        mediaPaths,
      });

      const responseJson =
        typeof response === "object" && response !== null
          ? (response as Json)
          : ({
              value: String(response),
            } as Json);

      await context.log("SocialWorker X post completed");

      return {
        ok: true,
        output: {
          published: true,
          action,
          channel,
          content,
          contentLength: content.length,
          replyToTweetId: replyToTweetId ?? null,
          mediaCount: mediaPaths?.length ?? 0,
          response: responseJson,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Social worker failed";
      await context.log(
      `SocialWorker xConfigured=${this.xAdapter.isConfigured()} xDryRun=${this.xAdapter.isDryRun()}`
      );
      await context.log(`SocialWorker failed: ${message}`);

      return {
        ok: false,
        error: message,
      };
    }
  }
}