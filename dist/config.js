export function loadConfig() {
    return {
        port: Number(process.env.PORT ?? 4100),
        defaultApprovalMode: process.env.ONECLAW_APPROVAL_MODE === "manual" ? "manual" : "auto",
        queueMode: process.env.ONECLAW_QUEUE_MODE === "bullmq" ? "bullmq" : "inline",
        queueName: process.env.ONECLAW_QUEUE_NAME ?? "oneclaw_tasks",
        redisUrl: process.env.REDIS_URL,
        postgresUrl: process.env.POSTGRES_URL,
        taskStoreMode: process.env.ONECLAW_TASK_STORE === "postgres" ? "postgres" : "memory",
        playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        playwrightTimeoutMs: Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 30000),
        artifactsDir: process.env.ONECLAW_ARTIFACTS_DIR ?? "./artifacts",
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
        xAppKey: process.env.X_APP_KEY,
        xAppSecret: process.env.X_APP_SECRET,
        xAccessToken: process.env.X_ACCESS_TOKEN,
        xAccessSecret: process.env.X_ACCESS_SECRET,
        adminToken: process.env.ONECLAW_ADMIN_TOKEN,
        xDryRun: process.env.ONECLAW_X_DRY_RUN === 'true',
        fileAllowlist: splitList(process.env.ONECLAW_FILE_ALLOWLIST),
        apiAllowlist: splitList(process.env.ONECLAW_API_ALLOWLIST),
        browserAllowlist: splitList(process.env.ONECLAW_BROWSER_ALLOWLIST),
        pluginDir: process.env.ONECLAW_PLUGIN_DIR ?? "./plugins",
        schedulerEnabled: process.env.ONECLAW_SCHEDULER_ENABLED !== "false",
        shellEnabled: process.env.ONECLAW_SHELL_ENABLED === "true",
        shellAllowlist: splitList(process.env.ONECLAW_SHELL_ALLOWLIST),
        searchEndpoint: process.env.ONECLAW_SEARCH_ENDPOINT,
        databaseUrl: process.env.ONECLAW_DATABASE_URL || process.env.DATABASE_URL,
    };
}
function splitList(value) {
    return String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
