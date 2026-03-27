export class SessionManager {
    browserSessions = new Map();
    getBrowserSession(taskId) {
        return this.browserSessions.get(taskId);
    }
    setBrowserSession(taskId, session) {
        this.browserSessions.set(taskId, session);
    }
    async closeTask(taskId) {
        const session = this.browserSessions.get(taskId);
        if (session) {
            await session.context.close().catch(() => undefined);
            await session.browser.close().catch(() => undefined);
            this.browserSessions.delete(taskId);
        }
    }
}
