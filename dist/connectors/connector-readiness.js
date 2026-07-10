function configured(keys) {
    return keys.filter((key) => Boolean(process.env[key]));
}
function readiness(input) {
    const requiredEnv = input.requiredEnv ?? [];
    const configuredEnv = configured(requiredEnv);
    const allConfigured = requiredEnv.length > 0 && configuredEnv.length === requiredEnv.length;
    const status = input.disabled
        ? "disabled"
        : input.dryRun
            ? "dry_run"
            : input.live
                ? "connected"
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
export function getConnectorReadiness(config) {
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
            live: true,
            actions: ["browser.open", "browser.extract", "browser.scrape", "browser.screenshot", "browser.click", "browser.type"],
            note: config.browserAllowlist.length ? "Browser hosts are allowlisted." : "Browser is live in development mode; configure host allowlist for production.",
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
            requiredEnv: ["GITHUB_TOKEN", "GITHUB_DEFAULT_OWNER"],
            prepared: true,
            actions: ["git.repo.get", "git.actions.runs", "git.checks.list", "git.issue.create", "git.pr.create", "git.ci.status", "git.repo.search"],
            note: "GitHub live connector supports repo search, CI status, and approval-gated issue creation.",
        }),
        readiness({
            key: "code_workspace",
            title: "Code Workspace",
            domain: "code",
            requiredEnv: ["ONECLAW_CODE_WORKSPACE_ALLOWLIST"],
            prepared: true,
            actions: ["code.workspace.status", "code.diff.prepare", "code.patch.apply"],
            note: "Code workspace supports guarded status checks, diff preparation, and approval-gated patch application.",
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
        readiness({
            key: "desktop",
            title: "Desktop / RPA",
            domain: "desktop",
            requiredEnv: ["ONECLAW_BRIDGE_MODE", "ONECLAW_DESKTOP_ENABLED", "ONECLAW_DESKTOP_APP_ALLOWLIST"],
            prepared: true,
            disabled: config.bridgeMode !== "desktop" || !config.desktopEnabled,
            actions: ["desktop.app.open", "desktop.screenshot", "desktop.click", "desktop.type", "desktop.hotkey", "desktop.app.state"],
            note: config.bridgeMode === "desktop" && config.desktopEnabled
                ? "Desktop RPA is live for allowlisted local macOS apps; screenshot/click/type/hotkey remain approval-gated."
                : "Desktop worker is disabled until ONECLAW_BRIDGE_MODE=desktop, ONECLAW_DESKTOP_ENABLED=true, and an app allowlist are configured.",
        }),
    ];
}
export function summarizeMaturity(capabilities) {
    return capabilities.reduce((summary, item) => {
        const key = item.maturity ?? "guarded";
        summary[key] = (summary[key] ?? 0) + 1;
        return summary;
    }, {});
}
