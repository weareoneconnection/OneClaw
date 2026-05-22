function asString(value) {
    return String(value ?? "").trim();
}
export class VideoWorker {
    name = "video_worker";
    async execute(input, context) {
        await context.log(`VideoWorker executing ${context.action}`);
        const path = asString(input.path || input.videoPath || input.streamUrl);
        if (context.action === "video.analyze") {
            if (!path)
                return { ok: false, error: "video.analyze requires input.path or input.streamUrl" };
            return { ok: true, output: { provider: "video", action: context.action, status: "video_analysis_prepared", path, findings: [] }, artifacts: path.startsWith("http") ? [] : [path] };
        }
        if (context.action === "video.summarize") {
            if (!path)
                return { ok: false, error: "video.summarize requires input.path or input.streamUrl" };
            return { ok: true, output: { provider: "video", action: context.action, status: "video_summary_prepared", path, summary: "" }, artifacts: path.startsWith("http") ? [] : [path] };
        }
        if (context.action === "camera.stream.inspect") {
            if (!path)
                return { ok: false, error: "camera.stream.inspect requires input.streamUrl" };
            return { ok: true, output: { provider: "camera", action: context.action, status: "stream_inspection_prepared", streamUrl: path, alerts: [] } };
        }
        return { ok: false, error: `Unsupported video action: ${context.action}` };
    }
}
