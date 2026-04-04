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

  return items.length > 0 ? items : undefined;
}

function isValidTweetId(value: string): boolean {
  return /^[0-9]{1,19}$/.test(value);
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

      const replyToTweetId = asOptionalString(input.replyToTweetId);
      if (replyToTweetId && !isValidTweetId(replyToTweetId)) {
        return {
          ok: false,
          error:
            "Invalid replyToTweetId: must be a numeric tweet ID (1-19 digits)",
        };
      }

      const mediaPaths = asStringArray(input.mediaPaths);

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
        }
      }

      await context.log(
        `SocialWorker preparing X post textLength=${content.length} mediaCount=${mediaPaths?.length ?? 0} reply=${replyToTweetId ? "yes" : "no"}`,
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
          channel,
          content,
          replyToTweetId: replyToTweetId ?? null,
          mediaCount: mediaPaths?.length ?? 0,
          response: responseJson,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Social worker failed";

      await context.log(`SocialWorker failed: ${message}`);

      return {
        ok: false,
        error: message,
      };
    }
  }
}
