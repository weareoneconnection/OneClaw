import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export class PlaywrightBrowserAdapter {
  constructor(private readonly options: { headless: boolean; timeoutMs: number; artifactsDir: string }) {}

  async launch(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    const browser = await chromium.launch({ headless: this.options.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(this.options.timeoutMs);
    return { browser, context, page };
  }

  async screenshot(page: Page, taskId: string, stepId: string, requestedPath?: string, fullPage = true): Promise<string> {
    const safeName = requestedPath ?? `${taskId}-${stepId}.png`;
    const resolved = path.resolve(this.options.artifactsDir, safeName);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    await page.screenshot({ path: resolved, fullPage });
    return resolved;
  }

  async scrape(page: Page, selector?: string, mode: "text" | "html" = "text"): Promise<string> {
    if (!selector) {
      return mode === "html" ? await page.content() : await page.locator("body").innerText();
    }
    const locator = page.locator(selector).first();
    return mode === "html" ? await locator.innerHTML() : await locator.innerText();
  }
}
