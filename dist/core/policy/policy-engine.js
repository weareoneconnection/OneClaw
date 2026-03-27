export class PolicyEngine {
    isAllowed(capability, approvalMode) {
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
