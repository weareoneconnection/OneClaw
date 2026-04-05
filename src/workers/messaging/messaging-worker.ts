import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { TelegramAdapter } from "../../adapters/telegram/telegram-adapter.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function toParseMode(value: Json | undefined): "HTML" | "Markdown" | undefined {
  if (value === "HTML") return "HTML";
  if (value === "Markdown") return "Markdown";
  return undefined;
}

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }

  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJson(val);
    }
    return out;
  }

  return String(value);
}

export class MessagingWorker implements Worker {
  readonly name = "messaging_worker";

  constructor(private readonly telegram: TelegramAdapter) {}

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`MessagingWorker executing ${context.action}`);

    const provider = asString(input.provider || "telegram").toLowerCase();

    if (provider !== "telegram") {
      return {
        ok: false,
        error: `Unsupported messaging provider: ${provider}`,
      };
    }

    const chatId =
      asString(input.chatId) ||
      asString(input.chat_id) ||
      String(process.env.TELEGRAM_DEFAULT_CHAT_ID ?? "").trim();

    const text = asString(input.text);
    const parseMode = toParseMode(input.parseMode);

    if (!chatId) {
      return {
        ok: false,
        error: "message.send requires input.chatId or TELEGRAM_DEFAULT_CHAT_ID",
      };
    }

    if (!text) {
      return {
        ok: false,
        error: "message.send requires input.text",
      };
    }

    const response = await this.telegram.sendMessage({
      chatId,
      text,
      parseMode,
    });

    return {
      ok: true,
      output: {
        delivered: true,
        provider,
        chatId,
        text,              // 关键：把实际发送内容带回去
        parseMode: parseMode ?? null,
        response: toJson(response),
      },
    };
  }
}
