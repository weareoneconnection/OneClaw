import fs from "node:fs/promises";
import path from "node:path";
function asString(value) {
    return String(value ?? "").trim();
}
export class StorageWorker {
    config;
    name = "storage_worker";
    constructor(config) {
        this.config = config;
    }
    async execute(input, context) {
        await context.log(`StorageWorker executing ${context.action}`);
        const key = asString(input.key || input.path);
        const root = path.resolve(this.config.artifactsDir, "storage");
        const target = path.resolve(root, key);
        if (!key || !target.startsWith(root))
            return { ok: false, error: `${context.action} requires safe input.key` };
        if (context.action === "storage.put") {
            const content = String(input.content ?? "");
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, content, "utf8");
            return { ok: true, output: { action: context.action, key, path: target, bytes: Buffer.byteLength(content) }, artifacts: [target] };
        }
        if (context.action === "storage.get") {
            const content = await fs.readFile(target, "utf8");
            return { ok: true, output: { action: context.action, key, path: target, content }, artifacts: [target] };
        }
        if (context.action === "storage.signUrl") {
            return { ok: true, output: { action: context.action, key, url: `artifact://${key}`, expiresIn: Number(input.expiresIn ?? 3600) } };
        }
        return { ok: false, error: `Unsupported storage action: ${context.action}` };
    }
}
