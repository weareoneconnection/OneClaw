import type { CapabilityRegistration } from "../../types/capability.js";
import type { ApprovalMode } from "../../types/task.js";

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
}

export class PolicyEngine {
  isAllowed(capability: CapabilityRegistration, approvalMode: ApprovalMode): PolicyDecision {
    if (capability.risk === "critical") {
      return {
        allowed: true,
        requiresApproval: true,
        reason: `Critical action '${capability.action}' requires approval`,
      };
    }

    if (approvalMode === "manual" && ["high", "critical"].includes(capability.risk)) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: `Action '${capability.action}' requires approval in manual mode`,
      };
    }

    return { allowed: true };
  }
}
