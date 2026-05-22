function asString(value) {
    return String(value ?? "").trim();
}
export class NotificationWorker {
    name = "notification_worker";
    async execute(input, context) {
        await context.log(`NotificationWorker executing ${context.action}`);
        const channel = asString(input.channel || "internal");
        const text = asString(input.text || input.message);
        if (!text)
            return { ok: false, error: `${context.action} requires input.text` };
        return { ok: true, output: { provider: "notification", action: context.action, status: "notification_prepared", channel, text } };
    }
}
