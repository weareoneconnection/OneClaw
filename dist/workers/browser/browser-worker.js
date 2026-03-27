export class BrowserWorker {
    browserAdapter;
    sessionManager;
    name = "browser_worker";
    constructor(browserAdapter, sessionManager) {
        this.browserAdapter = browserAdapter;
        this.sessionManager = sessionManager;
    }
    async execute(input, context) {
        context.log(`BrowserWorker executing ${context.action}`);
        let session = this.sessionManager.getBrowserSession(context.taskId);
        if (!session) {
            session = await this.browserAdapter.launch();
            this.sessionManager.setBrowserSession(context.taskId, session);
        }
        try {
            switch (context.action) {
                case "browser.open": {
                    const url = String(input.url ?? "");
                    if (!url)
                        return { ok: false, error: "browser.open requires input.url" };
                    await session.page.goto(url, { waitUntil: "load" });
                    return {
                        ok: true,
                        output: {
                            action: context.action,
                            url: session.page.url(),
                            title: await session.page.title(),
                        },
                    };
                }
                case "browser.click": {
                    const selector = String(input.selector ?? "");
                    if (!selector)
                        return { ok: false, error: "browser.click requires input.selector" };
                    await session.page.locator(selector).first().click();
                    return {
                        ok: true,
                        output: {
                            action: context.action,
                            clicked: selector,
                            url: session.page.url(),
                        },
                    };
                }
                case "browser.type": {
                    const selector = String(input.selector ?? "");
                    const text = String(input.text ?? "");
                    if (!selector)
                        return { ok: false, error: "browser.type requires input.selector" };
                    await session.page.locator(selector).first().fill(text);
                    return {
                        ok: true,
                        output: {
                            action: context.action,
                            selector,
                            typed: text,
                        },
                    };
                }
                case "browser.screenshot": {
                    const filePath = await this.browserAdapter.screenshot(session.page, context.taskId, context.stepId, typeof input.path === "string" ? input.path : undefined, input.fullPage !== false);
                    return {
                        ok: true,
                        output: {
                            action: context.action,
                            path: filePath,
                            url: session.page.url(),
                        },
                        artifacts: [filePath],
                    };
                }
                case "browser.scrape": {
                    const content = await this.browserAdapter.scrape(session.page, typeof input.selector === "string" ? input.selector : undefined, input.mode === "html" ? "html" : "text");
                    return {
                        ok: true,
                        output: {
                            action: context.action,
                            content,
                        },
                    };
                }
                default:
                    return { ok: false, error: `Unsupported browser action: ${context.action}` };
            }
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : "Unknown browser error" };
        }
    }
}
