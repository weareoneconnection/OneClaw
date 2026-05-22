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
    evaluateAction(input) {
        const base = this.isAllowed(input.capability, input.approvalMode);
        if (!base.allowed || base.requiresApproval)
            return base;
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
