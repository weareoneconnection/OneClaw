import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import type { PlaywrightBrowserAdapter } from "../../adapters/playwright/playwright-browser-adapter.js";
import type { SessionManager } from "../../state/session-manager.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asOptionalString(value: Json | undefined): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function asBoolean(value: Json | undefined, defaultValue = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return defaultValue;
}

function asPositiveNumber(value: Json | undefined): number | undefined {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return undefined;
}

export class BrowserWorker implements Worker {
  readonly name = "browser_worker";

  constructor(
    private readonly browserAdapter: PlaywrightBrowserAdapter,
    private readonly sessionManager: SessionManager,
  ) {}

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`BrowserWorker executing ${context.action}`);

    let session = this.sessionManager.getBrowserSession(context.taskId);

    if (!session) {
      await context.log(`BrowserWorker launching new session for task=${context.taskId}`);
      session = await this.browserAdapter.launch();
      this.sessionManager.setBrowserSession(context.taskId, session);
    }

    try {
      switch (context.action) {
        case "browser.open": {
          const url = asString(input.url);
          if (!url) {
            return {
              ok: false,
              error: "browser.open requires input.url",
            };
          }

          const waitUntilRaw = asString(input.waitUntil).toLowerCase();
          const waitUntil =
            waitUntilRaw === "load" ||
            waitUntilRaw === "domcontentloaded" ||
            waitUntilRaw === "networkidle" ||
            waitUntilRaw === "commit"
              ? waitUntilRaw
              : "domcontentloaded";

          const timeoutMs = asPositiveNumber(input.timeoutMs) ?? 45000;

          await this.browserAdapter.goto(session.page, url, {
            waitUntil,
            timeoutMs,
          });

          const title = await session.page.title();
          const currentUrl = session.page.url();

          await context.log(`BrowserWorker opened url=${currentUrl}`);

          return {
            ok: true,
            output: {
              action: context.action,
              url: currentUrl,
              title,
              opened: true,
            },
          };
        }

        case "browser.click": {
          const selector = asString(input.selector);
          if (!selector) {
            return {
              ok: false,
              error: "browser.click requires input.selector",
            };
          }

          const waitForNavigation = asBoolean(input.waitForNavigation, false);
          const timeoutMs = asPositiveNumber(input.timeoutMs);

          const locator = session.page.locator(selector).first();
          const count = await locator.count();

          if (count === 0) {
            return {
              ok: false,
              error: `browser.click selector not found: ${selector}`,
            };
          }

          if (waitForNavigation) {
            await Promise.all([
              session.page.waitForLoadState("load", {
                timeout: timeoutMs ?? undefined,
              }),
              locator.click(),
            ]);
          } else {
            await locator.click({
              timeout: timeoutMs ?? undefined,
            });
          }

          const currentUrl = session.page.url();
          const title = await session.page.title();

          await context.log(`BrowserWorker clicked selector=${selector}`);

          return {
            ok: true,
            output: {
              action: context.action,
              clicked: selector,
              url: currentUrl,
              title,
            },
          };
        }

        case "browser.type": {
          const selector = asString(input.selector);
          const text = asString(input.text);

          if (!selector) {
            return {
              ok: false,
              error: "browser.type requires input.selector",
            };
          }

          const clearFirst = asBoolean(input.clearFirst, true);
          const timeoutMs = asPositiveNumber(input.timeoutMs);

          const locator = session.page.locator(selector).first();
          const count = await locator.count();

          if (count === 0) {
            return {
              ok: false,
              error: `browser.type selector not found: ${selector}`,
            };
          }

          if (clearFirst) {
            await locator.fill(text, {
              timeout: timeoutMs ?? undefined,
            });
          } else {
            await locator.type(text, {
              timeout: timeoutMs ?? undefined,
            });
          }

          await context.log(
            `BrowserWorker typed selector=${selector} textLength=${text.length}`,
          );

          return {
            ok: true,
            output: {
              action: context.action,
              selector,
              typed: text,
              textLength: text.length,
            },
          };
        }

        case "browser.screenshot": {
          const requestedPath = asOptionalString(input.path);
          const fullPage = asBoolean(input.fullPage, true);

          const filePath = await this.browserAdapter.screenshot(
            session.page,
            context.taskId,
            context.stepId,
            requestedPath,
            fullPage,
          );

          const currentUrl = session.page.url();
          const title = await session.page.title();

          await context.log(`BrowserWorker screenshot saved path=${filePath}`);

          return {
            ok: true,
            output: {
              action: context.action,
              path: filePath,
              url: currentUrl,
              title,
              fullPage,
            },
            artifacts: [filePath],
          };
        }

        case "browser.scrape": {
          const selector = asOptionalString(input.selector);
          const mode = asString(input.mode).toLowerCase() === "html" ? "html" : "text";

          const content = await this.browserAdapter.scrape(
            session.page,
            selector,
            mode,
          );

          const currentUrl = session.page.url();
          const title = await session.page.title();

          await context.log(
            `BrowserWorker scraped mode=${mode} selector=${selector ?? "body"} contentLength=${content.length}`,
          );

          return {
            ok: true,
            output: {
              action: context.action,
              url: currentUrl,
              title,
              selector: selector ?? null,
              mode,
              content,
            },
          };
        }

        case "browser.extract": {
          const selector = asOptionalString(input.selector);
          const includeHtml = asBoolean(input.includeHtml, false);
          const maxTextLength = asPositiveNumber(input.maxTextLength);

          const extracted = await this.browserAdapter.extractPage(session.page, {
            selector,
            includeHtml,
            maxTextLength,
          });

          await context.log(
            `BrowserWorker extracted url=${extracted.url} title=${extracted.title} textLength=${extracted.text.length}`,
          );

          return {
            ok: true,
            output: {
              action: context.action,
              ...extracted,
              selector: selector ?? null,
              includeHtml,
            },
          };
        }

        default:
          return {
            ok: false,
            error: `Unsupported browser action: ${context.action}`,
          };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown browser error";

      await context.log(`BrowserWorker failed: ${message}`);

      return {
        ok: false,
        error: message,
      };
    }
  }
}