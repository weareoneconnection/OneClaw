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
import { ContentWorker } from "./workers/content/content-worker.js";
import { ConstructionWorker } from "./workers/construction/construction-worker.js";
import { HumanWorker } from "./workers/human/human-worker.js";
import { MessagingWorker } from "./workers/messaging/messaging-worker.js";
import { SocialWorker } from "./workers/social/social-worker.js";
import { Web3Worker } from "./workers/web3/web3-worker.js";
import { XReaderWorker } from "./workers/social/x-reader-worker.js";
import { ShellWorker } from "./workers/shell/shell-worker.js";
import { EmailWorker } from "./workers/email/email-worker.js";
import { CalendarWorker } from "./workers/calendar/calendar-worker.js";
import { DocumentWorker } from "./workers/documents/document-worker.js";
import { SpreadsheetWorker } from "./workers/spreadsheets/spreadsheet-worker.js";
import { DatabaseWorker } from "./workers/database/database-worker.js";
import { SearchWorker } from "./workers/search/search-worker.js";
import { StorageWorker } from "./workers/storage/storage-worker.js";
import { NotificationWorker } from "./workers/notification/notification-worker.js";
import { IdentityWorker } from "./workers/identity/identity-worker.js";
import { CrmWorker } from "./workers/crm/crm-worker.js";
import { CommerceWorker } from "./workers/commerce/commerce-worker.js";
import { CodeWorker } from "./workers/code/code-worker.js";
import { DeviceWorker } from "./workers/device/device-worker.js";
import { KnowledgeWorker } from "./workers/knowledge/knowledge-worker.js";
import { AudioWorker } from "./workers/audio/audio-worker.js";
import { VisionWorker } from "./workers/vision/vision-worker.js";
import { VideoWorker } from "./workers/video/video-worker.js";
import { GeoWorker } from "./workers/geo/geo-worker.js";
import { RpaWorker } from "./workers/rpa/rpa-worker.js";
import { LegalWorker } from "./workers/legal/legal-worker.js";
import { AccountingWorker } from "./workers/accounting/accounting-worker.js";
import { SimulationWorker } from "./workers/simulation/simulation-worker.js";
import { SessionManager } from "./state/session-manager.js";
import { createTaskQueue } from "./queue/index.js";
import { PreflightEngine } from "./core/preflight/preflight-engine.js";
import { SchedulerService } from "./core/scheduler/scheduler-service.js";
import { loadPluginCapabilities } from "./plugins/plugin-loader.js";
import type { NormalizedTaskDefinition } from "./types/task.js";
import type { CapabilityRegistration } from "./types/capability.js";

function enrichCapability(registration: CapabilityRegistration): CapabilityRegistration {
  const domain = registration.action.split(".")[0] || "custom";
  const required = requiredInputForAction(registration.action);
  const maturity = maturityForAction(registration.action);
  const liveMode = liveModeForAction(registration.action, maturity);

  return {
    domain,
    maturity,
    connectorKey: connectorKeyForAction(registration.action),
    liveMode,
    approvalRequired:
      registration.risk === "high" ||
      registration.risk === "critical" ||
      ["message.send", "social.post", "file.write", "file.append", "file.delete"].includes(registration.action),
    supportsDryRun: ["social.post", "message.send", "api.request", "api.webhook", "file.write", "file.append"].includes(registration.action),
    supportsRollback: ["file.write", "file.append"].includes(registration.action),
    inputSchema: {
      required,
      properties: {},
    },
    outputContract: outputContractForAction(registration.action),
    permissions: permissionsForAction(registration.action),
    ...registration,
  };
}

function requiredInputForAction(action: string): string[] {
  if (action.startsWith("browser.") && action !== "browser.screenshot") {
    if (action === "browser.click" || action === "browser.type") return ["selector"];
    return ["url"];
  }
  if (action.startsWith("api.")) return ["url"];
  if (action.startsWith("file.")) return ["path"];
  if (action === "social.post") return ["content"];
  if (action === "message.send") return ["text"];
  if (action.startsWith("x.search")) return ["query"];
  if (action.startsWith("construction.")) return ["title"];
  if (action === "web3.transfer") return ["chain", "to", "amount"];
  if (action === "shell.exec") return ["command"];
  if (action === "email.draft") return ["subject", "body"];
  if (action === "email.send") return ["to", "subject", "body"];
  if (action === "email.search") return ["query"];
  if (action === "calendar.event.create") return ["title", "start"];
  if (action === "calendar.event.update") return ["eventId"];
  if (action === "document.parse") return ["path"];
  if (action === "document.generate") return ["path", "content"];
  if (action === "spreadsheet.read") return ["path"];
  if (action === "spreadsheet.write") return ["path", "rows"];
  if (action === "database.query" || action === "database.write") return ["sql"];
  if (action.startsWith("search.")) return ["query"];
  if (action.startsWith("storage.")) return ["key"];
  if (action.startsWith("notification.")) return ["text"];
  if (action === "identity.resolve") return ["subject"];
  if (action === "secret.check") return ["key"];
  if (action === "crm.lead.create") return ["name"];
  if (action === "crm.contact.update") return ["contactId"];
  if (action === "crm.deal.create") return ["title"];
  if (action === "crm.activity.log") return ["subject"];
  if (action === "commerce.product.search") return ["query"];
  if (action === "commerce.order.prepare") return ["item"];
  if (action === "payment.invoice.create") return ["customer"];
  if (action === "payment.charge.prepare") return ["amount"];
  if (action === "git.issue.create") return ["repo", "title"];
  if (action === "git.pr.create") return ["repo", "title", "branch"];
  if (action === "git.ci.status") return ["repo"];
  if (action === "git.repo.search") return ["query"];
  if (action === "device.status.read") return ["deviceId"];
  if (action === "device.command.prepare") return ["deviceId", "command"];
  if (action === "iot.sensor.read") return ["sensorId"];
  if (action === "robot.task.prepare") return ["task"];
  if (action === "knowledge.upsert") return ["id", "text"];
  if (action === "knowledge.query") return ["query"];
  if (action === "vector.upsert") return ["id", "vector"];
  if (action === "audio.transcribe") return ["path"];
  if (action === "audio.synthesize") return ["text"];
  if (action === "voice.command.parse") return ["text"];
  if (action.startsWith("image.")) return ["path"];
  if (action === "construction.photo.inspect") return ["path"];
  if (action === "video.analyze" || action === "video.summarize") return ["path"];
  if (action === "camera.stream.inspect") return ["streamUrl"];
  if (action === "geo.geocode") return ["address"];
  if (action === "geo.route.plan") return ["origin", "destination"];
  if (action === "geo.site.map") return ["siteId"];
  if (action.startsWith("desktop.")) return ["app"];
  if (action.startsWith("legal.contract.") || action === "legal.risk.review") return [];
  if (action === "legal.approval.package") return ["title"];
  if (action === "finance.invoice.parse") return ["path"];
  if (action === "finance.reconcile") return ["source"];
  if (action === "finance.budget.review") return ["budgetId"];
  if (action.startsWith("simulation.") || action.startsWith("digitalTwin.")) return ["projectId"];
  return [];
}

function outputContractForAction(action: string): string[] {
  if (action.startsWith("browser.")) return ["status", "url", "artifacts"];
  if (action.startsWith("api.")) return ["status", "ok", "body"];
  if (action.startsWith("file.")) return ["path", "artifacts"];
  if (action === "social.post") return ["tweetId", "status"];
  if (action.startsWith("x.")) return ["data", "status"];
  if (action.startsWith("construction.")) return ["tracked", "payload"];
  if (action.startsWith("email.")) return ["status", "subject"];
  if (action.startsWith("calendar.")) return ["status", "event"];
  if (action.startsWith("document.")) return ["path", "text", "artifacts"];
  if (action.startsWith("spreadsheet.")) return ["path", "rows", "artifacts"];
  if (action.startsWith("database.")) return ["rows", "rowCount", "status"];
  if (action.startsWith("search.")) return ["query", "results"];
  if (action.startsWith("storage.")) return ["key", "path", "url"];
  if (action.startsWith("notification.")) return ["status", "channel"];
  if (action.startsWith("identity.") || action.startsWith("permission.") || action.startsWith("secret.")) return ["status", "configured"];
  if (action.startsWith("shell.")) return ["stdout", "stderr"];
  if (action.startsWith("crm.")) return ["status", "payload"];
  if (action.startsWith("commerce.") || action.startsWith("payment.")) return ["status", "approvalRequired"];
  if (action.startsWith("git.")) return ["status", "repo"];
  if (action.startsWith("device.") || action.startsWith("iot.") || action.startsWith("robot.")) return ["status", "deviceId", "approvalRequired"];
  if (action.startsWith("knowledge.") || action.startsWith("vector.")) return ["status", "namespace", "results"];
  if (action.startsWith("audio.") || action.startsWith("voice.")) return ["status", "transcript", "text"];
  if (action.startsWith("image.") || action === "construction.photo.inspect") return ["status", "findings", "text"];
  if (action.startsWith("video.") || action.startsWith("camera.")) return ["status", "summary", "alerts"];
  if (action.startsWith("geo.")) return ["status", "coordinates", "route"];
  if (action.startsWith("desktop.")) return ["status", "approvalRequired"];
  if (action.startsWith("legal.")) return ["status", "clauses", "risks", "approvalRequired"];
  if (action.startsWith("finance.")) return ["status", "fields", "exceptions", "variances"];
  if (action.startsWith("simulation.") || action.startsWith("digitalTwin.")) return ["status", "scenarios", "forecast"];
  return ["status"];
}

function permissionsForAction(action: string): string[] {
  if (action.startsWith("browser.")) return ["browser"];
  if (action.startsWith("api.")) return ["network"];
  if (action.startsWith("file.")) return ["filesystem"];
  if (action === "social.post" || action.startsWith("message.")) return ["communication"];
  if (action.startsWith("web3.")) return ["transaction"];
  if (action.startsWith("email.")) return ["email"];
  if (action.startsWith("calendar.")) return ["calendar"];
  if (action.startsWith("document.") || action.startsWith("spreadsheet.") || action.startsWith("storage.")) return ["filesystem"];
  if (action.startsWith("database.")) return ["database"];
  if (action.startsWith("search.")) return ["network"];
  if (action.startsWith("notification.")) return ["communication"];
  if (action.startsWith("identity.") || action.startsWith("permission.") || action.startsWith("secret.")) return ["identity"];
  if (action.startsWith("shell.")) return ["shell"];
  if (action.startsWith("crm.")) return ["crm"];
  if (action.startsWith("commerce.") || action.startsWith("payment.")) return ["commerce", "transaction"];
  if (action.startsWith("git.")) return ["code"];
  if (action.startsWith("device.") || action.startsWith("iot.") || action.startsWith("robot.")) return ["device"];
  if (action.startsWith("knowledge.") || action.startsWith("vector.")) return ["knowledge"];
  if (action.startsWith("audio.") || action.startsWith("voice.")) return ["audio"];
  if (action.startsWith("image.") || action.startsWith("video.") || action.startsWith("camera.") || action === "construction.photo.inspect") return ["vision"];
  if (action.startsWith("geo.")) return ["geo"];
  if (action.startsWith("desktop.")) return ["desktop"];
  if (action.startsWith("legal.")) return ["legal"];
  if (action.startsWith("finance.")) return ["finance"];
  if (action.startsWith("simulation.") || action.startsWith("digitalTwin.")) return ["simulation"];
  return [];
}

function maturityForAction(action: string): CapabilityRegistration["maturity"] {
  if (action === "social.post" || action.startsWith("x.")) return "production";
  if (action.startsWith("document.") || action.startsWith("spreadsheet.") || action.startsWith("storage.") || action.startsWith("identity.") || action.startsWith("secret.")) return "guarded";
  if (action.startsWith("shell.") || action.startsWith("email.") || action.startsWith("calendar.") || action.startsWith("database.") || action.startsWith("search.") || action.startsWith("notification.")) return "guarded";
  if (action.startsWith("crm.") || action.startsWith("commerce.") || action.startsWith("payment.") || action.startsWith("git.") || action.startsWith("device.") || action.startsWith("iot.") || action.startsWith("robot.") || action.startsWith("knowledge.") || action.startsWith("vector.")) return "guarded";
  if (action.startsWith("audio.") || action.startsWith("voice.") || action.startsWith("image.") || action.startsWith("video.") || action.startsWith("camera.") || action.startsWith("geo.") || action.startsWith("desktop.") || action.startsWith("legal.") || action.startsWith("finance.") || action.startsWith("simulation.") || action.startsWith("digitalTwin.")) return "guarded";
  if (action.startsWith("browser.") || action.startsWith("api.") || action.startsWith("file.") || action.startsWith("message.") || action.startsWith("human.")) return "guarded";
  if (action.startsWith("construction.")) return "planned";
  if (["web3.contract.write", "web3.transfer"].includes(action)) return "stub";
  return "guarded";
}

function liveModeForAction(action: string, maturity: CapabilityRegistration["maturity"]): CapabilityRegistration["liveMode"] {
  if (maturity === "stub") return "disabled";
  if (maturity === "planned") return "prepared";
  if (
    action.startsWith("email.") ||
    action.startsWith("calendar.") ||
    action.startsWith("crm.") ||
    action.startsWith("commerce.") ||
    action.startsWith("payment.") ||
    action.startsWith("git.") ||
    action.startsWith("device.") ||
    action.startsWith("iot.") ||
    action.startsWith("robot.") ||
    action.startsWith("audio.") ||
    action.startsWith("image.") ||
    action.startsWith("video.") ||
    action.startsWith("geo.") ||
    action.startsWith("desktop.") ||
    action.startsWith("legal.") ||
    action.startsWith("finance.") ||
    action.startsWith("simulation.") ||
    action.startsWith("digitalTwin.") ||
    action.startsWith("knowledge.") ||
    action.startsWith("vector.")
  ) return "prepared";
  return "live";
}

function connectorKeyForAction(action: string): string {
  if (action.startsWith("x.") || action === "social.post") return "x";
  if (action.startsWith("message.")) return "telegram";
  if (action.startsWith("browser.")) return "browser";
  if (action.startsWith("api.")) return "api";
  if (action.startsWith("file.") || action.startsWith("document.") || action.startsWith("spreadsheet.") || action.startsWith("storage.")) return "filesystem";
  if (action.startsWith("database.")) return "database";
  if (action.startsWith("shell.")) return "shell";
  if (action.startsWith("email.")) return "email";
  if (action.startsWith("calendar.")) return "calendar";
  if (action.startsWith("git.")) return "github";
  if (action.startsWith("payment.")) return "stripe";
  if (action.startsWith("knowledge.") || action.startsWith("vector.")) return "knowledge";
  return action.split(".")[0] || "custom";
}

export async function bootstrap(options?: { workerOnly?: boolean }) {
  const config = loadConfig();

  const artifactsDir = path.resolve(config.artifactsDir || "./artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });

  const planner = new TaskPlanner();
  const policy = new PolicyEngine();
  const capabilities = new CapabilityRegistry();
  const workers = new WorkerRegistry();
  const sessionManager = new SessionManager();
  const normalizedTaskStore = new Map<string, NormalizedTaskDefinition>();

  const shouldUsePostgres =
    config.taskStoreMode === "postgres" && Boolean(config.postgresUrl);

  const pool = shouldUsePostgres
    ? new Pool({ connectionString: config.postgresUrl })
    : undefined;

  const taskStore =
    shouldUsePostgres && pool
      ? new PostgresTaskStore(pool)
      : new InMemoryTaskStore();

  const httpAdapter = new HttpAdapter({
    timeoutMs: 15000,
    userAgent: "OneClaw/0.2",
  });

  const browserAdapter = new PlaywrightBrowserAdapter({
    headless: config.playwrightHeadless,
    timeoutMs: config.playwrightTimeoutMs,
    artifactsDir: artifactsDir,
  });

  const telegramAdapter = new TelegramAdapter(config.telegramBotToken);

  const xAdapter = new XAdapter({
    appKey: config.xAppKey,
    appSecret: config.xAppSecret,
    accessToken: config.xAccessToken,
    accessSecret: config.xAccessSecret,
    bearerToken: process.env.X_BEARER_TOKEN,
    dryRun: config.xDryRun,
  });

  workers.register(new BrowserWorker(browserAdapter, sessionManager));
  workers.register(new MessagingWorker(telegramAdapter));
  workers.register(new ApiWorker(httpAdapter));
  workers.register(new FileWorker());
  workers.register(new ContentWorker());
  workers.register(new ConstructionWorker());
  workers.register(new HumanWorker());
  workers.register(new SocialWorker(xAdapter));
  workers.register(new Web3Worker());
  workers.register(new XReaderWorker(xAdapter));
  workers.register(new ShellWorker(config));
  workers.register(new EmailWorker());
  workers.register(new CalendarWorker());
  workers.register(new DocumentWorker());
  workers.register(new SpreadsheetWorker());
  workers.register(new DatabaseWorker(config));
  workers.register(new SearchWorker(config, httpAdapter));
  workers.register(new StorageWorker(config));
  workers.register(new NotificationWorker());
  workers.register(new IdentityWorker());
  workers.register(new CrmWorker());
  workers.register(new CommerceWorker());
  workers.register(new CodeWorker());
  workers.register(new DeviceWorker());
  workers.register(new KnowledgeWorker());
  workers.register(new AudioWorker());
  workers.register(new VisionWorker());
  workers.register(new VideoWorker());
  workers.register(new GeoWorker());
  workers.register(new RpaWorker());
  workers.register(new LegalWorker());
  workers.register(new AccountingWorker());
  workers.register(new SimulationWorker());

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
    {
      action: "message.draft",
      workerName: "human_worker",
      risk: "low",
      description: "Draft an internal message",
    },
    {
      action: "message.notify",
      workerName: "human_worker",
      risk: "medium",
      description: "Create an internal notification request",
    },
    {
      action: "human.approval.request",
      workerName: "human_worker",
      risk: "high",
      description: "Create a human approval request",
    },
    {
      action: "human.confirmation.request",
      workerName: "human_worker",
      risk: "medium",
      description: "Create a human confirmation request",
    },
    {
    action: "content.generate",
    workerName: "content_worker",
    risk: "low",
    description: "Generate content using LLM",
    },
    {
    action: "content.transform",
    workerName: "content_worker",
    risk: "low",
    description: "Transform content",
    },
    {
      action: "result.compose",
      workerName: "content_worker",
      risk: "low",
      description: "Compose a final result from previous outputs",
    },
    // API
    {
      action: "api.request",
      workerName: "api_worker",
      risk: "medium",
      description: "Perform an HTTP request",
    },
    {
      action: "api.webhook",
      workerName: "api_worker",
      risk: "medium",
      description: "Send a webhook request",
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
      action: "file.append",
      workerName: "file_worker",
      risk: "medium",
      description: "Append to a file",
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

    // X reader
    {
      action: "x.getTweet",
      workerName: "x_reader_worker",
      risk: "low",
      description: "Read a single X tweet",
    },
    {
      action: "x.getTweets",
      workerName: "x_reader_worker",
      risk: "low",
      description: "Read multiple X tweets",
    },
    {
      action: "x.getUserByUsername",
      workerName: "x_reader_worker",
      risk: "low",
      description: "Resolve X user by username",
    },
    {
      action: "x.getUserTweets",
      workerName: "x_reader_worker",
      risk: "low",
      description: "Read recent tweets for an X user ID",
    },
    {
      action: "x.getUserTweetsByUsername",
      workerName: "x_reader_worker",
      risk: "low",
      description: "Read recent tweets for an X username",
    },
    {
      action: "x.searchRecentTweets",
      workerName: "x_reader_worker",
      risk: "medium",
      description: "Search recent tweets on X",
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

    // Construction OS
    {
      action: "construction.task.create",
      workerName: "construction_worker",
      risk: "low",
      description: "Create a Construction OS task",
    },
    {
      action: "construction.approval.request",
      workerName: "construction_worker",
      risk: "high",
      description: "Create a Construction OS approval request",
    },
    {
      action: "construction.procurement.followup",
      workerName: "construction_worker",
      risk: "medium",
      description: "Create a procurement follow-up action",
    },
    {
      action: "construction.inspection.create",
      workerName: "construction_worker",
      risk: "medium",
      description: "Create a QAQC inspection task",
    },
    {
      action: "construction.hse.corrective_action",
      workerName: "construction_worker",
      risk: "high",
      description: "Create an HSE corrective action",
    },
    {
      action: "construction.qaqc.ncr.create",
      workerName: "construction_worker",
      risk: "high",
      description: "Prepare or create a QAQC NCR",
    },
    {
      action: "construction.rfi.create",
      workerName: "construction_worker",
      risk: "medium",
      description: "Prepare or create an RFI",
    },
    {
      action: "construction.change_order.prepare",
      workerName: "construction_worker",
      risk: "high",
      description: "Prepare a change order package",
    },
    {
      action: "construction.schedule.recovery_plan",
      workerName: "construction_worker",
      risk: "medium",
      description: "Prepare a schedule recovery plan",
    },
    {
      action: "construction.contract.claim_prepare",
      workerName: "construction_worker",
      risk: "high",
      description: "Prepare a contract claim package",
    },
    {
      action: "construction.budget.variance_review",
      workerName: "construction_worker",
      risk: "medium",
      description: "Create a budget variance review action",
    },

    // Universal OS Worker Pack: shell
    {
      action: "shell.exec",
      workerName: "shell_worker",
      risk: "critical",
      description: "Execute a guarded shell command",
    },

    // Universal OS Worker Pack: email
    {
      action: "email.draft",
      workerName: "email_worker",
      risk: "low",
      description: "Prepare an email draft",
    },
    {
      action: "email.send",
      workerName: "email_worker",
      risk: "high",
      description: "Prepare or send an email through an email connector",
    },
    {
      action: "email.search",
      workerName: "email_worker",
      risk: "medium",
      description: "Search email through an email connector",
    },

    // Universal OS Worker Pack: calendar
    {
      action: "calendar.event.create",
      workerName: "calendar_worker",
      risk: "high",
      description: "Prepare a calendar event",
    },
    {
      action: "calendar.event.update",
      workerName: "calendar_worker",
      risk: "high",
      description: "Prepare a calendar event update",
    },
    {
      action: "calendar.availability.check",
      workerName: "calendar_worker",
      risk: "medium",
      description: "Check calendar availability",
    },

    // Universal OS Worker Pack: documents
    {
      action: "document.parse",
      workerName: "document_worker",
      risk: "low",
      description: "Parse a document into text",
    },
    {
      action: "document.generate",
      workerName: "document_worker",
      risk: "medium",
      description: "Generate a document artifact",
    },
    {
      action: "document.convert",
      workerName: "document_worker",
      risk: "medium",
      description: "Prepare a document conversion",
    },

    // Universal OS Worker Pack: spreadsheets
    {
      action: "spreadsheet.read",
      workerName: "spreadsheet_worker",
      risk: "low",
      description: "Read a spreadsheet or CSV file",
    },
    {
      action: "spreadsheet.write",
      workerName: "spreadsheet_worker",
      risk: "medium",
      description: "Write a spreadsheet or CSV file",
    },
    {
      action: "spreadsheet.summarize",
      workerName: "spreadsheet_worker",
      risk: "low",
      description: "Summarize spreadsheet data",
    },

    // Universal OS Worker Pack: database
    {
      action: "database.query",
      workerName: "database_worker",
      risk: "medium",
      description: "Run a read-only database query",
    },
    {
      action: "database.write",
      workerName: "database_worker",
      risk: "high",
      description: "Prepare a guarded database write",
    },
    {
      action: "database.schema.inspect",
      workerName: "database_worker",
      risk: "low",
      description: "Inspect database schema",
    },

    // Universal OS Worker Pack: search
    {
      action: "search.web",
      workerName: "search_worker",
      risk: "medium",
      description: "Search the web through a configured search connector",
    },
    {
      action: "search.news",
      workerName: "search_worker",
      risk: "medium",
      description: "Search recent news through a configured search connector",
    },

    // Universal OS Worker Pack: storage
    {
      action: "storage.put",
      workerName: "storage_worker",
      risk: "medium",
      description: "Store an artifact or object",
    },
    {
      action: "storage.get",
      workerName: "storage_worker",
      risk: "low",
      description: "Read an artifact or object",
    },
    {
      action: "storage.signUrl",
      workerName: "storage_worker",
      risk: "low",
      description: "Prepare an artifact URL",
    },

    // Universal OS Worker Pack: notifications
    {
      action: "notification.send",
      workerName: "notification_worker",
      risk: "medium",
      description: "Prepare or send a cross-channel notification",
    },
    {
      action: "notification.broadcast",
      workerName: "notification_worker",
      risk: "high",
      description: "Prepare a broadcast notification",
    },

    // Universal OS Worker Pack: identity and secrets
    {
      action: "identity.resolve",
      workerName: "identity_worker",
      risk: "low",
      description: "Resolve a user, role, or subject",
    },
    {
      action: "permission.check",
      workerName: "identity_worker",
      risk: "medium",
      description: "Prepare a permission check",
    },
    {
      action: "secret.check",
      workerName: "identity_worker",
      risk: "low",
      description: "Check whether a secret is configured without revealing it",
    },

    // Universal OS Worker Pack: CRM and sales
    {
      action: "crm.lead.create",
      workerName: "crm_worker",
      risk: "medium",
      description: "Prepare a CRM lead creation",
    },
    {
      action: "crm.contact.update",
      workerName: "crm_worker",
      risk: "medium",
      description: "Prepare a CRM contact update",
    },
    {
      action: "crm.deal.create",
      workerName: "crm_worker",
      risk: "medium",
      description: "Prepare a CRM deal creation",
    },
    {
      action: "crm.activity.log",
      workerName: "crm_worker",
      risk: "low",
      description: "Prepare a CRM activity log",
    },

    // Universal OS Worker Pack: commerce and payment
    {
      action: "commerce.product.search",
      workerName: "commerce_worker",
      risk: "medium",
      description: "Search commerce products through a connector",
    },
    {
      action: "commerce.order.prepare",
      workerName: "commerce_worker",
      risk: "high",
      description: "Prepare a commerce order",
    },
    {
      action: "payment.invoice.create",
      workerName: "commerce_worker",
      risk: "high",
      description: "Prepare a payment invoice",
    },
    {
      action: "payment.charge.prepare",
      workerName: "commerce_worker",
      risk: "critical",
      description: "Prepare a guarded payment charge",
    },

    // Universal OS Worker Pack: code and git
    {
      action: "git.issue.create",
      workerName: "code_worker",
      risk: "medium",
      description: "Prepare a Git issue",
    },
    {
      action: "git.pr.create",
      workerName: "code_worker",
      risk: "high",
      description: "Prepare a pull request",
    },
    {
      action: "git.ci.status",
      workerName: "code_worker",
      risk: "low",
      description: "Prepare a CI status lookup",
    },
    {
      action: "git.repo.search",
      workerName: "code_worker",
      risk: "medium",
      description: "Prepare a repository search",
    },

    // Universal OS Worker Pack: device and IoT
    {
      action: "device.status.read",
      workerName: "device_worker",
      risk: "medium",
      description: "Prepare a device status read",
    },
    {
      action: "device.command.prepare",
      workerName: "device_worker",
      risk: "high",
      description: "Prepare a guarded device command",
    },
    {
      action: "iot.sensor.read",
      workerName: "device_worker",
      risk: "medium",
      description: "Prepare an IoT sensor read",
    },
    {
      action: "robot.task.prepare",
      workerName: "device_worker",
      risk: "critical",
      description: "Prepare a guarded robot task",
    },

    // Universal OS Worker Pack: vector and knowledge
    {
      action: "knowledge.upsert",
      workerName: "knowledge_worker",
      risk: "medium",
      description: "Prepare a knowledge record upsert",
    },
    {
      action: "knowledge.query",
      workerName: "knowledge_worker",
      risk: "low",
      description: "Prepare a knowledge query",
    },
    {
      action: "vector.upsert",
      workerName: "knowledge_worker",
      risk: "medium",
      description: "Prepare a vector upsert",
    },
    {
      action: "vector.query",
      workerName: "knowledge_worker",
      risk: "low",
      description: "Prepare a vector query",
    },

    // Advanced Worker Pack: voice and audio
    {
      action: "audio.transcribe",
      workerName: "audio_worker",
      risk: "medium",
      description: "Prepare audio transcription",
    },
    {
      action: "audio.synthesize",
      workerName: "audio_worker",
      risk: "medium",
      description: "Prepare speech synthesis",
    },
    {
      action: "voice.command.parse",
      workerName: "audio_worker",
      risk: "low",
      description: "Parse a voice command transcript",
    },

    // Advanced Worker Pack: image and vision
    {
      action: "image.analyze",
      workerName: "vision_worker",
      risk: "medium",
      description: "Prepare image analysis",
    },
    {
      action: "image.extractText",
      workerName: "vision_worker",
      risk: "low",
      description: "Prepare OCR extraction",
    },
    {
      action: "construction.photo.inspect",
      workerName: "vision_worker",
      risk: "medium",
      description: "Prepare construction photo inspection",
    },

    // Advanced Worker Pack: video
    {
      action: "video.analyze",
      workerName: "video_worker",
      risk: "medium",
      description: "Prepare video analysis",
    },
    {
      action: "video.summarize",
      workerName: "video_worker",
      risk: "medium",
      description: "Prepare video summary",
    },
    {
      action: "camera.stream.inspect",
      workerName: "video_worker",
      risk: "high",
      description: "Prepare camera stream inspection",
    },

    // Advanced Worker Pack: map and geo
    {
      action: "geo.geocode",
      workerName: "geo_worker",
      risk: "low",
      description: "Prepare geocoding",
    },
    {
      action: "geo.route.plan",
      workerName: "geo_worker",
      risk: "medium",
      description: "Prepare route planning",
    },
    {
      action: "geo.site.map",
      workerName: "geo_worker",
      risk: "medium",
      description: "Prepare a site map",
    },

    // Advanced Worker Pack: desktop RPA
    {
      action: "desktop.app.open",
      workerName: "rpa_worker",
      risk: "high",
      description: "Prepare desktop app open",
    },
    {
      action: "desktop.click",
      workerName: "rpa_worker",
      risk: "high",
      description: "Prepare desktop click",
    },
    {
      action: "desktop.type",
      workerName: "rpa_worker",
      risk: "high",
      description: "Prepare desktop typing",
    },

    // Advanced Worker Pack: legal and contract
    {
      action: "legal.contract.extract",
      workerName: "legal_worker",
      risk: "medium",
      description: "Prepare contract clause extraction",
    },
    {
      action: "legal.risk.review",
      workerName: "legal_worker",
      risk: "high",
      description: "Prepare legal risk review",
    },
    {
      action: "legal.approval.package",
      workerName: "legal_worker",
      risk: "high",
      description: "Prepare a legal approval package",
    },

    // Advanced Worker Pack: finance and accounting
    {
      action: "finance.invoice.parse",
      workerName: "accounting_worker",
      risk: "medium",
      description: "Prepare invoice parsing",
    },
    {
      action: "finance.reconcile",
      workerName: "accounting_worker",
      risk: "high",
      description: "Prepare financial reconciliation",
    },
    {
      action: "finance.budget.review",
      workerName: "accounting_worker",
      risk: "high",
      description: "Prepare budget variance review",
    },

    // Advanced Worker Pack: simulation and digital twin
    {
      action: "simulation.schedule.run",
      workerName: "simulation_worker",
      risk: "medium",
      description: "Prepare schedule simulation",
    },
    {
      action: "simulation.cost.forecast",
      workerName: "simulation_worker",
      risk: "medium",
      description: "Prepare cost forecast simulation",
    },
    {
      action: "digitalTwin.state.sync",
      workerName: "simulation_worker",
      risk: "high",
      description: "Prepare digital twin state sync",
    },
  ] as const;

  for (const registration of regs) {
    capabilities.register(enrichCapability(registration));
  }

  const plugins = loadPluginCapabilities({
    pluginDir: config.pluginDir,
    capabilities,
  });

  const preflight = new PreflightEngine(capabilities, config);

  const runtime = new ExecutionRuntime(
    capabilities,
    workers,
    policy,
    taskStore,
    sessionManager,
    preflight,
  );

  const queue = await createTaskQueue({
    config,
    planner,
    runtime,
    taskStore,
  });

  const scheduler = new SchedulerService({
    planner,
    taskStore,
    queue,
    defaultApprovalMode: config.defaultApprovalMode,
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
    preflight,
    scheduler,
    plugins,
    normalizedTaskStore,
    pool,
  };
}

export type AppServices = Awaited<ReturnType<typeof bootstrap>>;
