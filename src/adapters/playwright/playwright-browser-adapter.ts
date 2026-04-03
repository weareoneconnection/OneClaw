import fs from "node:fs";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

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

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class PlaywrightBrowserAdapter {
  constructor(
    private readonly options: PlaywrightBrowserAdapterOptions,
  ) {}

  async launch(): Promise<BrowserSession> {
    const browser = await chromium.launch({
      headless: this.options.headless,
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(this.options.timeoutMs);

    return { browser, context, page };
  }

  async close(session: Partial<BrowserSession>): Promise<void> {
    try {
      if (session.page && !session.page.isClosed()) {
        await session.page.close();
      }
    } catch {
      // ignore page close errors
    }

    try {
      if (session.context) {
        await session.context.close();
      }
    } catch {
      // ignore context close errors
    }

    try {
      if (session.browser) {
        await session.browser.close();
      }
    } catch {
      // ignore browser close errors
    }
  }

  async goto(
    page: Page,
    url: string,
    options?: BrowserGotoOptions,
  ): Promise<void> {
    const targetUrl = asTrimmed(url);
    if (!targetUrl) {
      throw new Error("Browser URL is required");
    }

    await page.goto(targetUrl, {
      waitUntil: options?.waitUntil ?? "domcontentloaded",
      timeout: options?.timeoutMs ?? this.options.timeoutMs,
    });
  }

  async screenshot(
    page: Page,
    taskId: string,
    stepId: string,
    requestedPath?: string,
    fullPage = true,
  ): Promise<string> {
    const safeTaskId = sanitizeFileName(asTrimmed(taskId) || "task");
    const safeStepId = sanitizeFileName(asTrimmed(stepId) || "step");

    const fileName = requestedPath
      ? sanitizeFileName(asTrimmed(requestedPath))
      : `${safeTaskId}-${safeStepId}.png`;

    const resolvedPath = path.resolve(this.options.artifactsDir, fileName);

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    await page.screenshot({
      path: resolvedPath,
      fullPage,
    });

    return resolvedPath;
  }

  async scrape(
    page: Page,
    selector?: string,
    mode: "text" | "html" = "text",
  ): Promise<string> {
    const normalizedSelector = asTrimmed(selector);

    if (!normalizedSelector) {
      if (mode === "html") {
        return page.content();
      }
      return page.locator("body").innerText();
    }

    const locator = page.locator(normalizedSelector).first();

    const count = await locator.count();
    if (count === 0) {
      throw new Error(`Browser selector not found: ${normalizedSelector}`);
    }

    if (mode === "html") {
      return locator.innerHTML();
    }

    return locator.innerText();
  }

  async extractPage(
    page: Page,
    options?: {
      selector?: string;
      includeHtml?: boolean;
      maxTextLength?: number;
    },
  ): Promise<BrowserExtractResult> {
    const selector = asTrimmed(options?.selector);
    const includeHtml = Boolean(options?.includeHtml);
    const maxTextLength = options?.maxTextLength ?? 5000;

    const title = await page.title();
    const url = page.url();

    let text: string;
    let html: string | undefined;

    if (selector) {
      text = await this.scrape(page, selector, "text");
      if (includeHtml) {
        html = await this.scrape(page, selector, "html");
      }
    } else {
      text = await this.scrape(page, undefined, "text");
      if (includeHtml) {
        html = await this.scrape(page, undefined, "html");
      }
    }

    if (text.length > maxTextLength) {
      text = text.slice(0, maxTextLength);
    }

    return {
      url,
      title,
      text,
      html,
    };
  }
}
