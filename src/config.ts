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
  fileAllowlist: string[];
  apiAllowlist: string[];
  browserAllowlist: string[];
  pluginDir: string;
  schedulerEnabled: boolean;
  shellEnabled: boolean;
  shellAllowlist: string[];
  searchEndpoint?: string;
  databaseUrl?: string;
  maxAutoPaymentAmount: number;
  maxAutoDatabaseWriteRows: number;
  githubToken?: string;
  githubDefaultOwner?: string;
  bridgeMode: "api" | "desktop";
  bridgeId: string;
  bridgeName: string;
  desktopEnabled: boolean;
  desktopAppAllowlist: string[];
  desktopAppBlocklist: string[];
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
    fileAllowlist: splitList(process.env.ONECLAW_FILE_ALLOWLIST),
    apiAllowlist: splitList(process.env.ONECLAW_API_ALLOWLIST),
    browserAllowlist: splitList(process.env.ONECLAW_BROWSER_ALLOWLIST),
    pluginDir: process.env.ONECLAW_PLUGIN_DIR ?? "./plugins",
    schedulerEnabled: process.env.ONECLAW_SCHEDULER_ENABLED !== "false",
    shellEnabled: process.env.ONECLAW_SHELL_ENABLED === "true",
    shellAllowlist: splitList(process.env.ONECLAW_SHELL_ALLOWLIST),
    searchEndpoint: process.env.ONECLAW_SEARCH_ENDPOINT,
    databaseUrl: process.env.ONECLAW_DATABASE_URL || process.env.DATABASE_URL,
    maxAutoPaymentAmount: Number(process.env.ONECLAW_MAX_AUTO_PAYMENT_AMOUNT ?? 0),
    maxAutoDatabaseWriteRows: Number(process.env.ONECLAW_MAX_AUTO_DB_WRITE_ROWS ?? 0),
    githubToken: process.env.GITHUB_TOKEN,
    githubDefaultOwner: process.env.GITHUB_DEFAULT_OWNER,
    bridgeMode: process.env.ONECLAW_BRIDGE_MODE === "desktop" ? "desktop" : "api",
    bridgeId: process.env.ONECLAW_BRIDGE_ID ?? `oneclaw-${hostnameSafe()}`,
    bridgeName: process.env.ONECLAW_BRIDGE_NAME ?? "OneClaw Local Desktop Bridge",
    desktopEnabled: process.env.ONECLAW_DESKTOP_ENABLED === "true",
    desktopAppAllowlist: splitList(process.env.ONECLAW_DESKTOP_APP_ALLOWLIST),
    desktopAppBlocklist: splitList(process.env.ONECLAW_DESKTOP_APP_BLOCKLIST),
  };
}

function splitList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hostnameSafe(): string {
  return String(process.env.HOSTNAME ?? "local")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 64) || "local";
}
