import type { CapabilityRegistration } from "../../types/capability.js";
import type { ApprovalMode, Json } from "../../types/task.js";
export interface PolicyDecision {
    allowed: boolean;
    requiresApproval?: boolean;
    reason?: string;
}
export declare class PolicyEngine {
    isAllowed(capability: CapabilityRegistration, approvalMode: ApprovalMode): PolicyDecision;
    evaluateAction(input: {
        capability: CapabilityRegistration;
        approvalMode: ApprovalMode;
        actionInput: Record<string, Json>;
        environment?: string;
        limits?: {
            maxAutoPaymentAmount?: number;
            maxAutoDatabaseWriteRows?: number;
        };
    }): PolicyDecision;
}
