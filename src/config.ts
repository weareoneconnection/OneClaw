export interface AppConfig {
  port: number;
  defaultApprovalMode: "auto" | "manual";
  queueMode: "inline" | "bullmq";
  queueName: string;
  redisUrl?: string;
  postgresUrl?: string;
  taskStoreMode: "memory" | "postgres";
  playwrightHeadless: boolean;
  playwrightTimeoutMs: number;
  artifactsDir: string;
  telegramBotToken?: string;
  xAppKey?: string;
  xAppSecret?: string;
  xAccessToken?: string;
  xAccessSecret?: string;
  adminToken?: string;
  xDryRun: boolean;
}

export function loadConfig(): AppConfig {
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
  };
}
