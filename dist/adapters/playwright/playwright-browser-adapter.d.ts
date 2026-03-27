import { type Browser, type BrowserContext, type Page } from "playwright";
export declare class PlaywrightBrowserAdapter {
    private readonly options;
    constructor(options: {
        headless: boolean;
        timeoutMs: number;
        artifactsDir: string;
    });
    launch(): Promise<{
        browser: Browser;
        context: BrowserContext;
        page: Page;
    }>;
    screenshot(page: Page, taskId: string, stepId: string, requestedPath?: string, fullPage?: boolean): Promise<string>;
    scrape(page: Page, selector?: string, mode?: "text" | "html"): Promise<string>;
}
