function asString(value) {
    return String(value ?? "").trim();
}
export class IdentityWorker {
    name = "identity_worker";
    async execute(input, context) {
        await context.log(`IdentityWorker executing ${context.action}`);
        if (context.action === "identity.resolve") {
            const subject = asString(input.subject || input.userId || input.email);
            if (!subject)
                return { ok: false, error: "identity.resolve requires input.subject" };
            return { ok: true, output: { provider: "identity", action: context.action, subject, status: "resolved", roles: [] } };
        }
        if (context.action === "secret.check") {
            const key = asString(input.key);
            if (!key)
                return { ok: false, error: "secret.check requires input.key" };
            return { ok: true, output: { provider: "secret", action: context.action, key, configured: Boolean(process.env[key]) } };
        }
        if (context.action === "permission.check") {
            return { ok: true, output: { provider: "identity", action: context.action, status: "permission_prepared", allowed: false } };
        }
        return { ok: false, error: `Unsupported identity action: ${context.action}` };
    }
}
