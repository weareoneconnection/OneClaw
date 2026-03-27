import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { TelegramAdapter } from "../../adapters/telegram/telegram-adapter.js";
export declare class MessagingWorker implements Worker {
    private readonly telegram;
    readonly name = "messaging_worker";
    constructor(telegram: TelegramAdapter);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
