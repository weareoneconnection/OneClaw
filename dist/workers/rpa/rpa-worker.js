import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
function asString(value) {
    return String(value ?? "").trim();
}
function asNumber(value) {
    const num = Number(value);
    if (Number.isFinite(num))
        return num;
    return undefined;
}
function asStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    const text = asString(value);
    return text ? text.split(",").map((item) => item.trim()).filter(Boolean) : [];
}
function normalizeAppName(value) {
    return value.trim().replace(/\s+/g, " ");
}
function sanitizeFileName(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function isAllowedApp(app, allowlist) {
    if (!allowlist.length)
        return false;
    const normalized = app.toLowerCase();
    return allowlist.some((item) => item.toLowerCase() === normalized);
}
function appCandidates(app) {
    const appName = app.endsWith(".app") ? app : `${app}.app`;
    return [
        path.join("/Applications", appName),
        path.join("/System/Applications", appName),
        path.join("/System/Library/CoreServices", appName),
    ];
}
function resolveApplicationPath(app) {
    for (const candidate of appCandidates(app)) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
function quoteAppleScript(value) {
    return JSON.stringify(value);
}
function keyCodeFor(key) {
    const normalized = key.toLowerCase();
    const keyCodes = {
        return: 36,
        enter: 36,
        tab: 48,
        space: 49,
        delete: 51,
        backspace: 51,
        escape: 53,
        esc: 53,
        left: 123,
        right: 124,
        down: 125,
        up: 126,
    };
    return keyCodes[normalized];
}
function modifierFor(key) {
    const normalized = key.toLowerCase();
    const modifiers = {
        cmd: "command down",
        command: "command down",
        meta: "command down",
        ctrl: "control down",
        control: "control down",
        option: "option down",
        alt: "option down",
        shift: "shift down",
    };
    return modifiers[normalized];
}
async function runAppleScript(script) {
    return execFileAsync("osascript", ["-e", script], { timeout: 10000 });
}
function commandError(error) {
    const message = error instanceof Error ? error.message : "Unknown desktop command error";
    const firstLine = message.split("\n").find((line) => line.trim()) ?? message;
    return firstLine.length > 500 ? `${firstLine.slice(0, 497)}...` : firstLine;
}
export class RpaWorker {
    config;
    name = "rpa_worker";
    constructor(config) {
        this.config = config;
    }
    async execute(input, context) {
        await context.log(`RpaWorker executing ${context.action}`);
        const app = normalizeAppName(asString(input.app));
        if (context.action.startsWith("desktop.") && !this.config.desktopEnabled) {
            return {
                ok: true,
                output: {
                    provider: "rpa",
                    action: context.action,
                    status: "desktop_action_prepared",
                    app: app || null,
                    approvalRequired: context.action !== "desktop.app.state",
                    live: false,
                    reason: "ONECLAW_DESKTOP_ENABLED is not true.",
                },
            };
        }
        if (context.action.startsWith("desktop.") && os.platform() !== "darwin") {
            return { ok: false, error: `${context.action} live mode currently supports macOS only; platform=${os.platform()}` };
        }
        if (context.action.startsWith("desktop.") && context.action !== "desktop.app.state") {
            if (!app)
                return { ok: false, error: `${context.action} requires input.app` };
            if (!isAllowedApp(app, this.config.desktopAppAllowlist)) {
                return {
                    ok: false,
                    error: `${context.action} app is not allowlisted: ${app}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_action_blocked",
                        app,
                        allowlist: this.config.desktopAppAllowlist,
                    },
                };
            }
        }
        if (context.action === "desktop.app.open") {
            const appPath = resolveApplicationPath(app);
            if (!appPath) {
                return {
                    ok: false,
                    error: `desktop.app.open could not resolve application path for ${app}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_open_failed",
                        app,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
            try {
                await execFileAsync("open", [appPath], { timeout: 10000 });
                return {
                    ok: true,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_app_opened",
                        app,
                        appPath,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown desktop open error";
                return {
                    ok: false,
                    error: `desktop.app.open failed for ${app}: ${message}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_open_failed",
                        app,
                        appPath,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
        }
        if (context.action === "desktop.screenshot") {
            const requestedPath = asString(input.path);
            const fileName = requestedPath
                ? sanitizeFileName(requestedPath)
                : `${sanitizeFileName(context.taskId)}-${sanitizeFileName(context.stepId)}-desktop.png`;
            const filePath = path.resolve(this.config.artifactsDir, fileName);
            try {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                await execFileAsync("screencapture", ["-x", filePath], { timeout: 15000 });
                return {
                    ok: true,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_screenshot_captured",
                        app,
                        path: filePath,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                    artifacts: [filePath],
                };
            }
            catch (error) {
                return {
                    ok: false,
                    error: `desktop.screenshot failed: ${commandError(error)}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_screenshot_failed",
                        app,
                        path: filePath,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
        }
        if (context.action === "desktop.click") {
            const x = asNumber(input.x);
            const y = asNumber(input.y);
            if (x === undefined || y === undefined)
                return { ok: false, error: "desktop.click requires numeric input.x and input.y" };
            try {
                await runAppleScript([
                    `tell application ${quoteAppleScript(app)} to activate`,
                    "delay 0.2",
                    `tell application "System Events" to click at {${Math.round(x)}, ${Math.round(y)}}`,
                ].join("\n"));
                return {
                    ok: true,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_clicked",
                        app,
                        x: Math.round(x),
                        y: Math.round(y),
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
            catch (error) {
                return {
                    ok: false,
                    error: `desktop.click failed: ${commandError(error)}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_click_failed",
                        app,
                        x: Math.round(x),
                        y: Math.round(y),
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
        }
        if (context.action === "desktop.type") {
            const text = asString(input.text);
            if (!app || !text)
                return { ok: false, error: "desktop.type requires input.app and input.text" };
            try {
                await runAppleScript([
                    `tell application ${quoteAppleScript(app)} to activate`,
                    "delay 0.2",
                    `tell application "System Events" to keystroke ${quoteAppleScript(text)}`,
                ].join("\n"));
                return {
                    ok: true,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_typed",
                        app,
                        textLength: text.length,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
            catch (error) {
                return {
                    ok: false,
                    error: `desktop.type failed: ${commandError(error)}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_type_failed",
                        app,
                        textLength: text.length,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
        }
        if (context.action === "desktop.hotkey") {
            const keys = asStringArray(input.keys);
            if (!keys.length)
                return { ok: false, error: "desktop.hotkey requires input.keys" };
            const modifiers = keys.map(modifierFor).filter((item) => Boolean(item));
            const mainKeys = keys.filter((key) => !modifierFor(key));
            const mainKey = mainKeys[mainKeys.length - 1];
            if (!mainKey)
                return { ok: false, error: "desktop.hotkey requires one non-modifier key" };
            const usingClause = modifiers.length ? ` using {${modifiers.join(", ")}}` : "";
            const code = keyCodeFor(mainKey);
            const command = code === undefined
                ? `keystroke ${quoteAppleScript(mainKey)}${usingClause}`
                : `key code ${code}${usingClause}`;
            try {
                await runAppleScript([
                    `tell application ${quoteAppleScript(app)} to activate`,
                    "delay 0.2",
                    `tell application "System Events" to ${command}`,
                ].join("\n"));
                return {
                    ok: true,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_hotkey_sent",
                        app,
                        keys,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
            catch (error) {
                return {
                    ok: false,
                    error: `desktop.hotkey failed: ${commandError(error)}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_hotkey_failed",
                        app,
                        keys,
                        approvalRequired: true,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
        }
        if (context.action === "desktop.app.state") {
            if (app && !isAllowedApp(app, this.config.desktopAppAllowlist)) {
                return {
                    ok: false,
                    error: `desktop.app.state app is not allowlisted: ${app}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_state_blocked",
                        app,
                        allowlist: this.config.desktopAppAllowlist,
                    },
                };
            }
            try {
                const script = app
                    ? [
                        `tell application "System Events"`,
                        `set matches to application processes whose name is ${quoteAppleScript(app)}`,
                        "if (count of matches) is 0 then return \"running=false\"",
                        "set p to item 1 of matches",
                        "return \"running=true;frontmost=\" & (frontmost of p as text) & \";windowCount=\" & (count of windows of p as text)",
                        "end tell",
                    ].join("\n")
                    : [
                        `tell application "System Events"`,
                        "set p to first application process whose frontmost is true",
                        "return \"frontmost=\" & (name of p as text) & \";windowCount=\" & (count of windows of p as text)",
                        "end tell",
                    ].join("\n");
                const result = await runAppleScript(script);
                return {
                    ok: true,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_app_state_read",
                        app: app || null,
                        state: result.stdout.trim(),
                        approvalRequired: false,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
            catch (error) {
                return {
                    ok: false,
                    error: `desktop.app.state failed: ${commandError(error)}`,
                    output: {
                        provider: "rpa",
                        action: context.action,
                        status: "desktop_app_state_failed",
                        app: app || null,
                        approvalRequired: false,
                        live: true,
                        platform: os.platform(),
                    },
                };
            }
        }
        return { ok: false, error: `Unsupported RPA action: ${context.action}` };
    }
}
