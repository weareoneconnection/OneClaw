import type { Browser, BrowserContext, Page } from "playwright";

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export class SessionManager {
  private readonly browserSessions = new Map<string, BrowserSession>();

  getBrowserSession(taskId: string): BrowserSession | undefined {
    return this.browserSessions.get(taskId);
  }

  setBrowserSession(taskId: string, session: BrowserSession): void {
    this.browserSessions.set(taskId, session);
  }

  async closeTask(taskId: string): Promise<void> {
    const session = this.browserSessions.get(taskId);
    if (session) {
      await session.context.close().catch(() => undefined);
      await session.browser.close().catch(() => undefined);
      this.browserSessions.delete(taskId);
    }
  }
}
