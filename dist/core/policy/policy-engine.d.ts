import type { CapabilityRegistration } from "../../types/capability.js";
import type { ApprovalMode } from "../../types/task.js";
export interface PolicyDecision {
    allowed: boolean;
    requiresApproval?: boolean;
    reason?: string;
}
export declare class PolicyEngine {
    isAllowed(capability: CapabilityRegistration, approvalMode: ApprovalMode): PolicyDecision;
}
