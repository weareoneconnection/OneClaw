import type { CapabilityRegistration } from "../../types/capability.js";
import type { ApprovalMode, Json } from "../../types/task.js";

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

  evaluateAction(input: {
    capability: CapabilityRegistration;
    approvalMode: ApprovalMode;
    actionInput: Record<string, Json>;
    environment?: string;
    limits?: {
      maxAutoPaymentAmount?: number;
      maxAutoDatabaseWriteRows?: number;
    };
  }): PolicyDecision {
    const base = this.isAllowed(input.capability, input.approvalMode);
    if (!base.allowed || base.requiresApproval) return base;

    const action = input.capability.action;
    const amount = Number(input.actionInput.amount);
    if ((action.startsWith("payment.") || action.startsWith("commerce.order")) && Number.isFinite(amount)) {
      const max = input.limits?.maxAutoPaymentAmount ?? 0;
      if (max <= 0 || amount > max) {
        return {
          allowed: true,
          requiresApproval: true,
          reason: `Amount ${amount} exceeds automatic payment limit ${max}.`,
        };
      }
    }

    if (action === "database.write") {
      return {
        allowed: true,
        requiresApproval: true,
        reason: "Database writes require approval.",
      };
    }

    if (action.startsWith("shell.") || action.startsWith("desktop.") || action.startsWith("device.command") || action.startsWith("robot.")) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: `${action} requires operator approval.`,
      };
    }

    return base;
  }
}
