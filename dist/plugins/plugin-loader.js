import fs from "node:fs";
import path from "node:path";
export function loadPluginCapabilities(params) {
    const root = path.resolve(params.pluginDir);
    if (!fs.existsSync(root))
        return [];
    const loaded = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const manifestPath = path.join(root, entry.name, "plugin.json");
        if (!fs.existsSync(manifestPath))
            continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        for (const capability of manifest.capabilities ?? []) {
            params.capabilities.register({
                ...capability,
                pluginKey: manifest.key,
            });
        }
        loaded.push(manifest);
    }
    return loaded;
}
