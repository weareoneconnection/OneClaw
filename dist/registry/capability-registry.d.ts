import type { CapabilityRegistration } from "../types/capability.js";
export declare class CapabilityRegistry {
    private readonly items;
    register(registration: CapabilityRegistration): void;
    get(action: string): CapabilityRegistration | undefined;
    list(): CapabilityRegistration[];
    manifest(): {
        action: string;
        workerName: string;
        domain: string;
        connectorKey: string;
        risk: "low" | "medium" | "high" | "critical";
        maturity: "production" | "guarded" | "prepared" | "planned" | "stub";
        liveMode: "prepared" | "live" | "dry_run" | "disabled";
        description: string;
        approvalRequired: boolean;
        supportsDryRun: boolean;
        supportsRollback: boolean;
        inputSchema: {
            required?: string[];
            properties?: Record<string, "string" | "number" | "boolean" | "array" | "object" | "unknown">;
        };
        outputContract: string[];
        permissions: string[];
        rateLimit: {
            maxPerMinute?: number;
            maxPerHour?: number;
        } | null;
        pluginKey: string | null;
    }[];
}
