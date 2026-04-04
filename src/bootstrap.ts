import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { HttpAdapter } from "./adapters/http/http-adapter.js";
import { PlaywrightBrowserAdapter } from "./adapters/playwright/playwright-browser-adapter.js";
import { TelegramAdapter } from "./adapters/telegram/telegram-adapter.js";
import { XAdapter } from "./adapters/x/x-adapter.js";
import { PolicyEngine } from "./core/policy/policy-engine.js";
import { TaskPlanner } from "./core/planner/task-planner.js";
import { ExecutionRuntime } from "./core/runtime/execution-runtime.js";
import { CapabilityRegistry } from "./registry/capability-registry.js";
import { WorkerRegistry } from "./registry/worker-registry.js";
import { InMemoryTaskStore } from "./state/task-store.js";
import { PostgresTaskStore } from "./db/postgres-task-store.js";
import { ApiWorker } from "./workers/api/api-worker.js";
import { BrowserWorker } from "./workers/browser/browser-worker.js";
import { FileWorker } from "./workers/files/file-worker.js";
import { MessagingWorker } from "./workers/messaging/messaging-worker.js";
import { SocialWorker } from "./workers/social/social-worker.js";
import { Web3Worker } from "./workers/web3/web3-worker.js";
import { SessionManager } from "./state/session-manager.js";
import { createTaskQueue } from "./queue/index.js";
import type { NormalizedTaskDefinition } from "./types/task.js";

export async function bootstrap(options?: { workerOnly?: boolean }) {
  const config = loadConfig();

  fs.mkdirSync(path.resolve(config.artifactsDir), { recursive: true });

  const planner = new TaskPlanner();
  const policy = new PolicyEngine();
  const capabilities = new CapabilityRegistry();
  const workers = new WorkerRegistry();
  const sessionManager = new SessionManager();
  const normalizedTaskStore = new Map<string, NormalizedTaskDefinition>();

  const pool =
    config.taskStoreMode === "postgres"
      ? new Pool({ connectionString: config.postgresUrl })
      : undefined;

  const taskStore =
    config.taskStoreMode === "postgres" && pool
      ? new PostgresTaskStore(pool)
      : new InMemoryTaskStore();

  const httpAdapter = new HttpAdapter({
    timeoutMs: 15000,
    userAgent: "OneClaw/0.2",
  });

  const browserAdapter = new PlaywrightBrowserAdapter({
    headless: config.playwrightHeadless,
    timeoutMs: config.playwrightTimeoutMs,
    artifactsDir: config.artifactsDir,
  });

  const telegramAdapter = new TelegramAdapter(config.telegramBotToken);

  const xAdapter = new XAdapter({
    appKey: config.xAppKey,
    appSecret: config.xAppSecret,
    accessToken: config.xAccessToken,
    accessSecret: config.xAccessSecret,
    dryRun: config.xDryRun,
  });

  workers.register(new BrowserWorker(browserAdapter, sessionManager));
  workers.register(new MessagingWorker(telegramAdapter));
  workers.register(new ApiWorker(httpAdapter));
  workers.register(new FileWorker());
  workers.register(new SocialWorker(xAdapter));
  workers.register(new Web3Worker());

  const regs = [
    // Browser
    {
      action: "browser.open",
      workerName: "browser_worker",
      risk: "low",
      description: "Open a browser target",
    },
    {
      action: "browser.click",
      workerName: "browser_worker",
      risk: "low",
      description: "Click a browser target",
    },
    {
      action: "browser.type",
      workerName: "browser_worker",
      risk: "medium",
      description: "Type into a browser field",
    },
    {
      action: "browser.screenshot",
      workerName: "browser_worker",
      risk: "low",
      description: "Take a screenshot",
    },
    {
      action: "browser.scrape",
      workerName: "browser_worker",
      risk: "low",
      description: "Scrape text or html",
    },
    {
      action: "browser.extract",
      workerName: "browser_worker",
      risk: "low",
      description: "Extract rendered page content",
    },

    // Messaging (TG)
    {
      action: "message.send",
      workerName: "messaging_worker",
      risk: "medium",
      description: "Send a message",
    },

    // API
    {
      action: "api.request",
      workerName: "api_worker",
      risk: "medium",
      description: "Perform an HTTP request",
    },

    // File
    {
      action: "file.read",
      workerName: "file_worker",
      risk: "low",
      description: "Read a file",
    },
    {
      action: "file.write",
      workerName: "file_worker",
      risk: "medium",
      description: "Write a file",
    },
    {
      action: "file.exists",
      workerName: "file_worker",
      risk: "low",
      description: "Check whether a file or directory exists",
    },
    {
      action: "file.list",
      workerName: "file_worker",
      risk: "low",
      description: "List files in a directory",
    },
    {
      action: "file.delete",
      workerName: "file_worker",
      risk: "high",
      description: "Delete a file or directory",
    },

    // Social (X)
    {
      action: "social.post",
      workerName: "social_worker",
      risk: "high",
      description: "Publish social content",
    },

    // Web3 (new)
    {
      action: "web3.ping",
      workerName: "web3_worker",
      risk: "low",
      description: "Check web3 worker readiness",
    },
    {
      action: "web3.balance",
      workerName: "web3_worker",
      risk: "low",
      description: "Read wallet or address balance",
    },
    {
      action: "web3.tx",
      workerName: "web3_worker",
      risk: "low",
      description: "Read transaction details",
    },
    {
      action: "web3.contract.read",
      workerName: "web3_worker",
      risk: "low",
      description: "Read smart contract state",
    },
    {
      action: "web3.contract.write",
      workerName: "web3_worker",
      risk: "high",
      description: "Write smart contract state",
    },
    {
      action: "web3.transfer",
      workerName: "web3_worker",
      risk: "high",
      description: "Transfer native token or asset",
    },

    // Web3 legacy aliases (for old flows compatibility)
    {
      action: "chain.query",
      workerName: "web3_worker",
      risk: "low",
      description: "Legacy alias: query chain state",
    },
    {
      action: "wallet.read",
      workerName: "web3_worker",
      risk: "medium",
      description: "Legacy alias: read wallet data",
    },
  ] as const;

  for (const registration of regs) {
    capabilities.register(registration);
  }

  const runtime = new ExecutionRuntime(
    capabilities,
    workers,
    policy,
    taskStore,
    sessionManager,
  );

  const queue = await createTaskQueue({
    config,
    planner,
    runtime,
    taskStore,
  });

  if (!options?.workerOnly && config.queueMode === "bullmq") {
    console.log(
      "BullMQ mode enabled. Start a separate worker with: npm run dev:worker",
    );
  }

  return {
    config,
    taskStore,
    sessionManager,
    planner,
    policy,
    capabilities,
    workers,
    runtime,
    queue,
    normalizedTaskStore,
    pool,
  };
}

export type AppServices = Awaited<ReturnType<typeof bootstrap>>;