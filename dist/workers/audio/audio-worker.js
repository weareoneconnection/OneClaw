function asString(value) {
    return String(value ?? "").trim();
}
export class AudioWorker {
    name = "audio_worker";
    async execute(input, context) {
        await context.log(`AudioWorker executing ${context.action}`);
        const path = asString(input.path || input.audioPath);
        if (context.action === "audio.transcribe") {
            if (!path)
                return { ok: false, error: "audio.transcribe requires input.path" };
            return { ok: true, output: { provider: "audio", action: context.action, status: "transcription_prepared", path, language: asString(input.language || "auto"), transcript: "" }, artifacts: [path] };
        }
        if (context.action === "audio.synthesize") {
            const text = asString(input.text);
            if (!text)
                return { ok: false, error: "audio.synthesize requires input.text" };
            return { ok: true, output: { provider: "audio", action: context.action, status: "speech_synthesis_prepared", text, voice: asString(input.voice || "default") } };
        }
        if (context.action === "voice.command.parse") {
            const text = asString(input.text || input.transcript);
            if (!text)
                return { ok: false, error: "voice.command.parse requires input.text or input.transcript" };
            return { ok: true, output: { provider: "voice", action: context.action, status: "voice_command_prepared", text, intent: null } };
        }
        return { ok: false, error: `Unsupported audio action: ${context.action}` };
    }
}
