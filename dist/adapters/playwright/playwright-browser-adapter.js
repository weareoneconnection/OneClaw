import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
export class PlaywrightBrowserAdapter {
    options;
    constructor(options) {
        this.options = options;
    }
    async launch() {
        const browser = await chromium.launch({ headless: this.options.headless });
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(this.options.timeoutMs);
        return { browser, context, page };
    }
    async screenshot(page, taskId, stepId, requestedPath, fullPage = true) {
        const safeName = requestedPath ?? `${taskId}-${stepId}.png`;
        const resolved = path.resolve(this.options.artifactsDir, safeName);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        await page.screenshot({ path: resolved, fullPage });
        return resolved;
    }
    async scrape(page, selector, mode = "text") {
        if (!selector) {
            return mode === "html" ? await page.content() : await page.locator("body").innerText();
        }
        const locator = page.locator(selector).first();
        return mode === "html" ? await locator.innerHTML() : await locator.innerText();
    }
}
