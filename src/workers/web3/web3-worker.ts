import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";

export class Web3Worker implements Worker {
  readonly name = "web3_worker";

  async execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult> {
    context.log(`Web3Worker executing ${context.action}`);
    return {
      ok: true,
      output: {
        chain: input.chain ?? "unknown",
        action: context.action,
        mocked: true,
      },
    };
  }
}
