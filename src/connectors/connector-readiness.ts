import type { AppConfig } from "../config.js";

export type ConnectorStatus = "connected" | "configured" | "dry_run" | "prepared" | "not_configured" | "disabled";

export type ConnectorReadiness = {
  key: string;
  title: string;
  domain: string;
  status: ConnectorStatus;
  mode: "live" | "dry_run" | "prepared" | "disabled";
  requiredEnv: string[];
  configuredEnv: string[];
  actions: string[];
  note: string;
};

function configured(keys: string[]) {
  return keys.filter((key) => Boolean(process.env[key]));
}

function readiness(input: {
  key: string;
  title: string;
  domain: string;
  requiredEnv?: string[];
  actions: string[];
  prepared?: boolean;
  disabled?: boolean;
  dryRun?: boolean;
  note: string;
}): ConnectorReadiness {
  const requiredEnv = input.requiredEnv ?? [];
  const configuredEnv = configured(requiredEnv);
  const allConfigured = requiredEnv.length > 0 && configuredEnv.length === requiredEnv.length;
  const status: ConnectorStatus = input.disabled
    ? "disabled"
    : input.dryRun
      ? "dry_run"
      : allConfigured
        ? "connected"
        : input.prepared
          ? "prepared"
          : "not_configured";

  return {
    key: input.key,
    title: input.title,
    domain: input.domain,
    status,
    mode: status === "connected" ? "live" : status === "dry_run" ? "dry_run" : status === "disabled" ? "disabled" : "prepared",
    requiredEnv,
    configuredEnv,
    actions: input.actions,
    note: input.note,
  };
}

export function getConnectorReadiness(config: AppConfig): ConnectorReadiness[] {
  return [
    readiness({
      key: "x",
      title: "X / Twitter",
      domain: "social",
      requiredEnv: ["X_APP_KEY", "X_APP_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"],
      dryRun: config.xDryRun,
      actions: ["social.post", "x.getTweet", "x.searchRecentTweets"],
      note: "X writing is live when OAuth keys are configured and dry-run is off.",
    }),
    readiness({
      key: "telegram",
      title: "Telegram",
      domain: "messaging",
      requiredEnv: ["TELEGRAM_BOT_TOKEN"],
      actions: ["message.send", "notification.send"],
      note: "Telegram is the first live messaging connector.",
    }),
    readiness({
      key: "filesystem",
      title: "Filesystem",
      domain: "file",
      prepared: true,
      actions: ["file.read", "file.write", "document.generate", "spreadsheet.write", "storage.put"],
      note: config.fileAllowlist.length ? "Filesystem is constrained by ONECLAW_FILE_ALLOWLIST." : "Filesystem is open in development mode; configure allowlist for production.",
    }),
    readiness({
      key: "browser",
      title: "Browser",
      domain: "browser",
      prepared: true,
      actions: ["browser.open", "browser.extract", "browser.click", "browser.type"],
      note: config.browserAllowlist.length ? "Browser hosts are allowlisted." : "Browser is available in development mode; configure host allowlist for production.",
    }),
    readiness({
      key: "api",
      title: "HTTP API",
      domain: "api",
      prepared: true,
      actions: ["api.request", "api.webhook"],
      note: config.apiAllowlist.length ? "API hosts are allowlisted." : "API calls are available in development mode; configure host allowlist for production.",
    }),
    readiness({
      key: "database",
      title: "Database",
      domain: "database",
      requiredEnv: ["ONECLAW_DATABASE_URL"],
      prepared: true,
      actions: ["database.query", "database.write", "database.schema.inspect"],
      note: "Read-only queries can run when a database URL is configured; writes remain approval-gated.",
    }),
    readiness({
      key: "shell",
      title: "Shell",
      domain: "shell",
      disabled: !config.shellEnabled,
      prepared: config.shellEnabled,
      actions: ["shell.exec"],
      note: "Shell is disabled by default and should remain allowlisted plus approval-gated.",
    }),
    readiness({
      key: "email",
      title: "Email",
      domain: "email",
      requiredEnv: ["ONECLAW_EMAIL_PROVIDER"],
      prepared: true,
      actions: ["email.draft", "email.send", "email.search"],
      note: "Email worker is prepared; add Gmail/Outlook/SMTP connector for live send/search.",
    }),
    readiness({
      key: "calendar",
      title: "Calendar",
      domain: "calendar",
      requiredEnv: ["ONECLAW_CALENDAR_PROVIDER"],
      prepared: true,
      actions: ["calendar.event.create", "calendar.event.update", "calendar.availability.check"],
      note: "Calendar worker is prepared; add Google/Outlook calendar connector for live scheduling.",
    }),
    readiness({
      key: "github",
      title: "GitHub / Git",
      domain: "code",
      requiredEnv: ["GITHUB_TOKEN"],
      prepared: true,
      actions: ["git.issue.create", "git.pr.create", "git.ci.status", "git.repo.search"],
      note: "Git worker is prepared; configure GitHub token for live repository actions.",
    }),
    readiness({
      key: "stripe",
      title: "Stripe / Payment",
      domain: "payment",
      requiredEnv: ["STRIPE_SECRET_KEY"],
      prepared: true,
      actions: ["payment.invoice.create", "payment.charge.prepare"],
      note: "Payment actions remain prepared and approval-gated even when configured.",
    }),
    readiness({
      key: "knowledge",
      title: "Knowledge / Vector Store",
      domain: "knowledge",
      requiredEnv: ["ONECLAW_VECTOR_URL"],
      prepared: true,
      actions: ["knowledge.upsert", "knowledge.query", "vector.upsert", "vector.query"],
      note: "Knowledge worker is prepared; connect vector DB for live retrieval.",
    }),
  ];
}

export function summarizeMaturity(capabilities: Array<{ maturity?: string }>) {
  return capabilities.reduce<Record<string, number>>((summary, item) => {
    const key = item.maturity ?? "guarded";
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}
