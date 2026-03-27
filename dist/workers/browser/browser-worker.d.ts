import type { ExecutionContext, Worker, WorkerExecutionResult } from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import type { PlaywrightBrowserAdapter } from "../../adapters/playwright/playwright-browser-adapter.js";
import type { SessionManager } from "../../state/session-manager.js";
export declare class BrowserWorker implements Worker {
    private readonly browserAdapter;
    private readonly sessionManager;
    readonly name = "browser_worker";
    constructor(browserAdapter: PlaywrightBrowserAdapter, sessionManager: SessionManager);
    execute(input: Record<string, Json>, context: ExecutionContext): Promise<WorkerExecutionResult>;
}
