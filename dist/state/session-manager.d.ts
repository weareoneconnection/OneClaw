import type { Browser, BrowserContext, Page } from "playwright";
interface BrowserSession {
    browser: Browser;
    context: BrowserContext;
    page: Page;
}
export declare class SessionManager {
    private readonly browserSessions;
    getBrowserSession(taskId: string): BrowserSession | undefined;
    setBrowserSession(taskId: string, session: BrowserSession): void;
    closeTask(taskId: string): Promise<void>;
}
export {};
