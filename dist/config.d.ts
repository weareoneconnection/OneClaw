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
}
export declare function loadConfig(): AppConfig;
