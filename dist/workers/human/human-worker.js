function asString(value) {
    return String(value ?? "").trim();
}
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
export class HumanWorker {
    name = "human_worker";
    async execute(input, context) {
        await context.log(`HumanWorker executing ${context.action}`);
        const title = asString(input.title) ||
            asString(input.subject) ||
            (context.action === "human.confirmation.request"
                ? "Human confirmation requested"
                : "Human approval requested");
        const reason = asString(input.reason) ||
            asString(input.note) ||
            asString(input.description) ||
            asString(input.text) ||
            asString(input.message);
        if (!reason) {
            return {
                ok: false,
                error: `${context.action} requires input.reason, input.note, or input.description`,
            };
        }
        return {
            ok: true,
            output: {
                provider: "human",
                action: context.action,
                title,
                reason,
                requesterRole: asString(input.requesterRole || "system"),
                approverRole: asString(input.approverRole || "owner"),
                priority: asString(input.priority || "high"),
                status: context.action === "human.confirmation.request"
                    ? "confirmation_requested"
                    : "approval_requested",
                payload: asRecord(input.payload),
            },
        };
    }
}
