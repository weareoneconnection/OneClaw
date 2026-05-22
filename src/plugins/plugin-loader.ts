import fs from "node:fs";
import path from "node:path";
import type { CapabilityRegistry } from "../registry/capability-registry.js";
import type { CapabilityRegistration } from "../types/capability.js";

type PluginManifest = {
  key: string;
  title?: string;
  capabilities?: CapabilityRegistration[];
};

export function loadPluginCapabilities(params: {
  pluginDir: string;
  capabilities: CapabilityRegistry;
}) {
  const root = path.resolve(params.pluginDir);
  if (!fs.existsSync(root)) return [];

  const loaded: PluginManifest[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, "plugin.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PluginManifest;
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
