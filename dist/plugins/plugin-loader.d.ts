import type { CapabilityRegistry } from "../registry/capability-registry.js";
import type { CapabilityRegistration } from "../types/capability.js";
type PluginManifest = {
    key: string;
    title?: string;
    capabilities?: CapabilityRegistration[];
};
export declare function loadPluginCapabilities(params: {
    pluginDir: string;
    capabilities: CapabilityRegistry;
}): PluginManifest[];
export {};
