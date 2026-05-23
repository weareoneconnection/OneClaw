import type { AppConfig } from "../config.js";
export type BridgeCheck = {
    key: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
};
type BridgeCapability = {
    action: string;
    workerName: string;
    risk?: string;
    approvalRequired?: boolean | null;
    liveMode?: string | null;
    inputSchema?: {
        required?: string[] | null;
    } | null;
    outputContract?: string[] | null;
};
export declare function getBridgeDiagnostics(config: AppConfig): BridgeCheck[];
export declare function getBridgeStatus(config: AppConfig): {
    ok: boolean;
    bridge: {
        id: string;
        name: string;
        mode: "api" | "desktop";
        role: string;
        online: boolean;
        platform: NodeJS.Platform;
        arch: string;
        hostname: string;
        desktopEnabled: boolean;
        appAllowlist: string[];
        appBlocklist: string[];
        actions: string[];
        routing: {
            localExecution: boolean;
            cloudForwarding: string;
            note: string;
        };
        security: {
            approvalGated: string[];
            readOnly: string[];
            allowlistRequired: boolean;
            blocklistSupported: boolean;
        };
    };
    diagnostics: BridgeCheck[];
};
export declare function getBridgeRegistration(config: AppConfig, capabilities: BridgeCapability[]): {
    ok: boolean;
    type: string;
    bridgeId: string;
    name: string;
    role: string;
    platform: NodeJS.Platform;
    hostname: string;
    endpointHint: string;
    capabilities: {
        action: string;
        workerName: string;
        risk: string | undefined;
        approvalRequired: boolean | null | undefined;
        liveMode: string | null | undefined;
        inputRequired: string[];
        outputContract: string[];
    }[];
    status: {
        id: string;
        name: string;
        mode: "api" | "desktop";
        role: string;
        online: boolean;
        platform: NodeJS.Platform;
        arch: string;
        hostname: string;
        desktopEnabled: boolean;
        appAllowlist: string[];
        appBlocklist: string[];
        actions: string[];
        routing: {
            localExecution: boolean;
            cloudForwarding: string;
            note: string;
        };
        security: {
            approvalGated: string[];
            readOnly: string[];
            allowlistRequired: boolean;
            blocklistSupported: boolean;
        };
    };
};
export {};
