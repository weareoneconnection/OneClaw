function asString(value) {
    return String(value ?? "").trim();
}
export class RpaWorker {
    name = "rpa_worker";
    async execute(input, context) {
        await context.log(`RpaWorker executing ${context.action}`);
        const app = asString(input.app);
        if (context.action === "desktop.app.open") {
            if (!app)
                return { ok: false, error: "desktop.app.open requires input.app" };
            return { ok: true, output: { provider: "rpa", action: context.action, status: "desktop_open_prepared", app, approvalRequired: true } };
        }
        if (context.action === "desktop.click") {
            if (!app)
                return { ok: false, error: "desktop.click requires input.app" };
            return { ok: true, output: { provider: "rpa", action: context.action, status: "desktop_click_prepared", app, selector: asString(input.selector), approvalRequired: true } };
        }
        if (context.action === "desktop.type") {
            const text = asString(input.text);
            if (!app || !text)
                return { ok: false, error: "desktop.type requires input.app and input.text" };
            return { ok: true, output: { provider: "rpa", action: context.action, status: "desktop_type_prepared", app, text, approvalRequired: true } };
        }
        return { ok: false, error: `Unsupported RPA action: ${context.action}` };
    }
}
