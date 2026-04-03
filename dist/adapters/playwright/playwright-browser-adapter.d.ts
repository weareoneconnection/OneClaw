import { type Browser, type BrowserContext, type Page } from "playwright";
export interface PlaywrightBrowserAdapterOptions {
    headless: boolean;
    timeoutMs: number;
    artifactsDir: string;
}
export interface BrowserSession {
    browser: Browser;
    context: BrowserContext;
    page: Page;
}
export interface BrowserGotoOptions {
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
    timeoutMs?: number;
}
export interface BrowserExtractResult {
    url: string;
    title: string;
    text: string;
    html?: string;
}
export declare class PlaywrightBrowserAdapter {
    private readonly options;
    constructor(options: PlaywrightBrowserAdapterOptions);
    launch(): Promise<BrowserSession>;
    close(session: Partial<BrowserSession>): Promise<void>;
    goto(page: Page, url: string, options?: BrowserGotoOptions): Promise<void>;
    screenshot(page: Page, taskId: string, stepId: string, requestedPath?: string, fullPage?: boolean): Promise<string>;
    scrape(page: Page, selector?: string, mode?: "text" | "html"): Promise<string>;
    extractPage(page: Page, options?: {
        selector?: string;
        includeHtml?: boolean;
        maxTextLength?: number;
    }): Promise<BrowserExtractResult>;
}
