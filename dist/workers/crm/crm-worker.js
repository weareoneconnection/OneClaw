function asString(value) {
    return String(value ?? "").trim();
}
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return value;
}
export class CrmWorker {
    name = "crm_worker";
    async execute(input, context) {
        await context.log(`CrmWorker executing ${context.action}`);
        const provider = asString(input.provider || "generic");
        if (context.action === "crm.lead.create") {
            const name = asString(input.name);
            if (!name)
                return { ok: false, error: "crm.lead.create requires input.name" };
            return { ok: true, output: { provider, action: context.action, status: "lead_prepared", name, email: asString(input.email), payload: asRecord(input.payload) } };
        }
        if (context.action === "crm.contact.update") {
            const contactId = asString(input.contactId);
            if (!contactId)
                return { ok: false, error: "crm.contact.update requires input.contactId" };
            return { ok: true, output: { provider, action: context.action, status: "contact_update_prepared", contactId, payload: asRecord(input.payload) } };
        }
        if (context.action === "crm.deal.create") {
            const title = asString(input.title);
            if (!title)
                return { ok: false, error: "crm.deal.create requires input.title" };
            return { ok: true, output: { provider, action: context.action, status: "deal_prepared", title, amount: input.amount ?? null, payload: asRecord(input.payload) } };
        }
        if (context.action === "crm.activity.log") {
            const subject = asString(input.subject || input.title);
            if (!subject)
                return { ok: false, error: "crm.activity.log requires input.subject" };
            return { ok: true, output: { provider, action: context.action, status: "activity_prepared", subject, payload: asRecord(input.payload) } };
        }
        return { ok: false, error: `Unsupported CRM action: ${context.action}` };
    }
}
