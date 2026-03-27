import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { XAdapter } from "../../adapters/x/x-adapter.js";

export class SocialWorker implements Worker {
  readonly name = "social_worker";

  constructor(private readonly xAdapter: XAdapter) {}

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    await context.log(`SocialWorker executing ${context.action}`);
    const channel = String(input.channel ?? "x");

    if (channel === "x") {
      const mediaPaths = Array.isArray(input.mediaPaths)
        ? input.mediaPaths.map((item) => String(item))
        : undefined;
      const response = await this.xAdapter.createPost({
        text: String(input.content ?? ""),
        replyToTweetId: input.replyToTweetId ? String(input.replyToTweetId) : undefined,
        mediaPaths,
      });
      return {
        ok: true,
        output: {
          published: true,
          channel,
          response: response as Json,
        },
      };
    }

    return { ok: false, error: `Unsupported social channel: ${channel}` };
  }
}
