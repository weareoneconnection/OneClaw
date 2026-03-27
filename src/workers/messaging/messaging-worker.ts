import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { TelegramAdapter } from "../../adapters/telegram/telegram-adapter.js";

export class MessagingWorker implements Worker {
  readonly name = "messaging_worker";

  constructor(private readonly telegram: TelegramAdapter) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`MessagingWorker executing ${context.action}`);
    const provider = String(input.provider ?? "telegram");

    if (provider === "telegram") {
      const response = await this.telegram.sendMessage({
        chatId: String(input.chatId ?? ""),
        text: String(input.text ?? ""),
        parseMode: input.parseMode === "HTML" ? "HTML" : input.parseMode === "Markdown" ? "Markdown" : undefined,
      });
      return { ok: true, output: { delivered: true, provider, response: response as Json } };
    }

    return { ok: false, error: `Unsupported messaging provider: ${provider}` };
  }
}
