import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const DESKTOP_ACTIONS = [
    "desktop.app.open",
    "desktop.app.state",
    "desktop.screenshot",
    "desktop.hotkey",
    "desktop.type",
    "desktop.click",
];
function canRun(command, args = []) {
    try {
        execFileSync(command, args, { stdio: "ignore", timeout: 5000 });
        return true;
    }
    catch {
        return false;
    }
}
function checkArtifactsDir(config) {
    try {
        const resolved = path.resolve(config.artifactsDir);
        fs.mkdirSync(resolved, { recursive: true });
        fs.accessSync(resolved, fs.constants.W_OK);
        return {
            key: "artifacts",
            label: "Artifact directory",
            status: "pass",
            detail: resolved,
        };
    }
    catch (error) {
        return {
            key: "artifacts",
            label: "Artifact directory",
            status: "fail",
            detail: error instanceof Error ? error.message : "Artifact directory is not writable.",
        };
    }
}
function checkSystemEvents() {
    if (os.platform() !== "darwin") {
        return {
            key: "accessibility",
            label: "Accessibility",
            status: "fail",
            detail: "Desktop bridge requires macOS for local UI automation.",
        };
    }
    const ok = canRun("osascript", [
        "-e",
        'tell application "System Events" to return count of application processes',
    ]);
    return {
        key: "accessibility",
        label: "Accessibility",
        status: ok ? "pass" : "warn",
        detail: ok
            ? "System Events is reachable."
            : "Grant Accessibility permission to the terminal or app running OneClaw.",
    };
}
function checkScreenCapture() {
    if (os.platform() !== "darwin") {
        return {
            key: "screen_recording",
            label: "Screen Recording",
            status: "fail",
            detail: "Desktop screenshots require macOS Screen Recording permission.",
        };
    }
    const ok = canRun("screencapture", ["-x", "/tmp/oneclaw-bridge-check.png"]);
    try {
        fs.rmSync("/tmp/oneclaw-bridge-check.png", { force: true });
    }
    catch {
        // ignore cleanup failure
    }
    return {
        key: "screen_recording",
        label: "Screen Recording",
        status: ok ? "pass" : "warn",
        detail: ok
            ? "screencapture is reachable."
            : "Grant Screen Recording permission to the terminal or app running OneClaw.",
    };
}
export function getBridgeDiagnostics(config) {
    return [
        {
            key: "mode",
            label: "Bridge mode",
            status: config.bridgeMode === "desktop" ? "pass" : "warn",
            detail: config.bridgeMode === "desktop"
                ? "ONECLAW_BRIDGE_MODE=desktop"
                : "Set ONECLAW_BRIDGE_MODE=desktop for local computer control.",
        },
        {
            key: "platform",
            label: "Platform",
            status: os.platform() === "darwin" ? "pass" : "fail",
            detail: `${os.platform()} ${os.release()} ${os.arch()}`,
        },
        {
            key: "desktop_enabled",
            label: "Desktop enabled",
            status: config.desktopEnabled ? "pass" : "fail",
            detail: config.desktopEnabled
                ? "ONECLAW_DESKTOP_ENABLED=true"
                : "Set ONECLAW_DESKTOP_ENABLED=true.",
        },
        {
            key: "allowlist",
            label: "App allowlist",
            status: config.desktopAppAllowlist.length ? "pass" : "fail",
            detail: config.desktopAppAllowlist.length
                ? config.desktopAppAllowlist.join(", ")
                : "Set ONECLAW_DESKTOP_APP_ALLOWLIST.",
        },
        {
            key: "blocklist",
            label: "Sensitive app blocklist",
            status: config.desktopAppBlocklist.length ? "pass" : "warn",
            detail: config.desktopAppBlocklist.length
                ? config.desktopAppBlocklist.join(", ")
                : "Optional: set ONECLAW_DESKTOP_APP_BLOCKLIST for sensitive apps.",
        },
        checkArtifactsDir(config),
        checkSystemEvents(),
        checkScreenCapture(),
    ];
}
export function getBridgeStatus(config) {
    const diagnostics = getBridgeDiagnostics(config);
    const blocking = diagnostics.filter((item) => item.status === "fail");
    return {
        ok: blocking.length === 0,
        bridge: {
            id: config.bridgeId,
            name: config.bridgeName,
            mode: config.bridgeMode,
            role: config.bridgeMode === "desktop" ? "local_desktop_bridge" : "api_service",
            online: true,
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            desktopEnabled: config.desktopEnabled,
            appAllowlist: config.desktopAppAllowlist,
            appBlocklist: config.desktopAppBlocklist,
            actions: config.bridgeMode === "desktop" ? DESKTOP_ACTIONS : [],
            routing: {
                localExecution: config.bridgeMode === "desktop",
                cloudForwarding: "prepared",
                note: "Cloud-to-local relay is a next-stage bridge protocol; local bridge execution is available now.",
            },
            security: {
                approvalGated: ["desktop.screenshot", "desktop.click", "desktop.type", "desktop.hotkey"],
                readOnly: ["desktop.app.state"],
                allowlistRequired: true,
                blocklistSupported: true,
            },
        },
        diagnostics,
    };
}
export function getBridgeRegistration(config, capabilities) {
    const desktopCapabilities = capabilities.filter((item) => item.action.startsWith("desktop."));
    const status = getBridgeStatus(config);
    return {
        ok: true,
        type: "oneclaw.local_desktop_bridge.registration.v1",
        bridgeId: config.bridgeId,
        name: config.bridgeName,
        role: "local_desktop_bridge",
        platform: os.platform(),
        hostname: os.hostname(),
        endpointHint: `http://localhost:${config.port}`,
        capabilities: desktopCapabilities.map((item) => ({
            action: item.action,
            workerName: item.workerName,
            risk: item.risk,
            approvalRequired: item.approvalRequired,
            liveMode: item.liveMode,
            inputRequired: item.inputSchema?.required ?? [],
            outputContract: item.outputContract ?? [],
        })),
        status: status.bridge,
    };
}
