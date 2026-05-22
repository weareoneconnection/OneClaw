function asString(value) {
    return String(value ?? "").trim();
}
export class VisionWorker {
    name = "vision_worker";
    async execute(input, context) {
        await context.log(`VisionWorker executing ${context.action}`);
        const path = asString(input.path || input.imagePath);
        if (context.action === "image.analyze") {
            if (!path)
                return { ok: false, error: "image.analyze requires input.path" };
            return { ok: true, output: { provider: "vision", action: context.action, status: "image_analysis_prepared", path, findings: [] }, artifacts: [path] };
        }
        if (context.action === "image.extractText") {
            if (!path)
                return { ok: false, error: "image.extractText requires input.path" };
            return { ok: true, output: { provider: "vision", action: context.action, status: "ocr_prepared", path, text: "" }, artifacts: [path] };
        }
        if (context.action === "construction.photo.inspect") {
            if (!path)
                return { ok: false, error: "construction.photo.inspect requires input.path" };
            return { ok: true, output: { provider: "vision", action: context.action, status: "inspection_prepared", path, projectId: asString(input.projectId), issues: [], approvalRequired: false }, artifacts: [path] };
        }
        return { ok: false, error: `Unsupported vision action: ${context.action}` };
    }
}
