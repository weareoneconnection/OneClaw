import type { AppConfig } from "../../config.js";
import type { CapabilityRegistry } from "../../registry/capability-registry.js";
import type { Json, NormalizedTaskDefinition, TaskDefinition } from "../../types/task.js";
export interface PreflightCheck {
    id: string;
    status: "pass" | "warn" | "fail";
    label: string;
    detail: string;
}
export interface PreflightReport {
    ok: boolean;
    status: "ready" | "needs_approval" | "blocked";
    taskName: string;
    actions: string[];
    checks: PreflightCheck[];
    approvalActions: string[];
    deniedActions: string[];
    unsupportedActions: string[];
}
export declare class PreflightEngine {
    private readonly capabilities;
    private readonly config;
    constructor(capabilities: CapabilityRegistry, config: AppConfig);
    evaluate(task: NormalizedTaskDefinition | TaskDefinition): PreflightReport;
    evaluateStep(action: string, input: Record<string, Json>, stepId?: string): PreflightReport;
    private evaluateSandbox;
}
