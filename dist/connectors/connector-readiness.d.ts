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
export declare function getConnectorReadiness(config: AppConfig): ConnectorReadiness[];
export declare function summarizeMaturity(capabilities: Array<{
    maturity?: string;
}>): Record<string, number>;
