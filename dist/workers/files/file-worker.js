import fs from "node:fs/promises";
import path from "node:path";
function asString(value) {
    return String(value ?? "").trim();
}
function asOptionalString(value) {
    const text = String(value ?? "").trim();
    return text ? text : undefined;
}
function asBoolean(value, defaultValue = false) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true")
            return true;
        if (normalized === "false")
            return false;
    }
    return defaultValue;
}
export class FileWorker {
    name = "file_worker";
    async execute(input, context) {
        await context.log(`FileWorker executing ${context.action}`);
        try {
            if (context.action === "file.read") {
                const filePath = asString(input.path);
                if (!filePath) {
                    return {
                        ok: false,
                        error: "file.read requires input.path",
                    };
                }
                const encoding = asString(input.encoding || "utf8");
                const content = await fs.readFile(filePath, encoding);
                const stat = await fs.stat(filePath);
                await context.log(`FileWorker read path=${filePath} bytes=${stat.size}`);
                return {
                    ok: true,
                    output: {
                        action: context.action,
                        path: filePath,
                        content,
                        bytes: stat.size,
                    },
                    artifacts: [filePath],
                };
            }
            if (context.action === "file.write") {
                const filePath = asString(input.path);
                if (!filePath) {
                    return {
                        ok: false,
                        error: "file.write requires input.path",
                    };
                }
                const content = String(input.content ?? "");
                const ensureDir = asBoolean(input.ensureDir, true);
                if (ensureDir) {
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                }
                await fs.writeFile(filePath, content, "utf8");
                const bytes = Buffer.byteLength(content);
                await context.log(`FileWorker wrote path=${filePath} bytes=${bytes}`);
                return {
                    ok: true,
                    output: {
                        action: context.action,
                        path: filePath,
                        bytes,
                        written: true,
                    },
                    artifacts: [filePath],
                };
            }
            if (context.action === "file.append") {
                const filePath = asString(input.path);
                if (!filePath) {
                    return {
                        ok: false,
                        error: "file.append requires input.path",
                    };
                }
                const content = String(input.content ?? "");
                const ensureDir = asBoolean(input.ensureDir, true);
                if (ensureDir) {
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                }
                await fs.appendFile(filePath, content, "utf8");
                const bytes = Buffer.byteLength(content);
                await context.log(`FileWorker appended path=${filePath} bytes=${bytes}`);
                return {
                    ok: true,
                    output: {
                        action: context.action,
                        path: filePath,
                        bytes,
                        appended: true,
                    },
                    artifacts: [filePath],
                };
            }
            if (context.action === "file.exists") {
                const filePath = asString(input.path);
                if (!filePath) {
                    return {
                        ok: false,
                        error: "file.exists requires input.path",
                    };
                }
                let exists = true;
                let isFile = false;
                let isDirectory = false;
                let size = 0;
                try {
                    const stat = await fs.stat(filePath);
                    isFile = stat.isFile();
                    isDirectory = stat.isDirectory();
                    size = stat.size;
                }
                catch {
                    exists = false;
                }
                await context.log(`FileWorker exists path=${filePath} exists=${exists}`);
                return {
                    ok: true,
                    output: {
                        action: context.action,
                        path: filePath,
                        exists,
                        isFile,
                        isDirectory,
                        size,
                    },
                };
            }
            if (context.action === "file.list") {
                const dirPath = asString(input.path);
                if (!dirPath) {
                    return {
                        ok: false,
                        error: "file.list requires input.path",
                    };
                }
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                const items = entries.map((entry) => ({
                    name: entry.name,
                    path: path.join(dirPath, entry.name),
                    type: entry.isDirectory() ? "directory" : "file",
                }));
                await context.log(`FileWorker listed path=${dirPath} count=${items.length}`);
                return {
                    ok: true,
                    output: {
                        action: context.action,
                        path: dirPath,
                        count: items.length,
                        items: items,
                    },
                };
            }
            if (context.action === "file.delete") {
                const filePath = asString(input.path);
                if (!filePath) {
                    return {
                        ok: false,
                        error: "file.delete requires input.path",
                    };
                }
                const recursive = asBoolean(input.recursive, false);
                try {
                    const stat = await fs.stat(filePath);
                    if (stat.isDirectory()) {
                        await fs.rm(filePath, { recursive, force: true });
                    }
                    else {
                        await fs.unlink(filePath);
                    }
                }
                catch (error) {
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : "Failed to delete file",
                    };
                }
                await context.log(`FileWorker deleted path=${filePath}`);
                return {
                    ok: true,
                    output: {
                        action: context.action,
                        path: filePath,
                        deleted: true,
                    },
                };
            }
            return {
                ok: false,
                error: `Unsupported file action: ${context.action}`,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown file error";
            await context.log(`FileWorker failed: ${message}`);
            return {
                ok: false,
                error: message,
            };
        }
    }
}
