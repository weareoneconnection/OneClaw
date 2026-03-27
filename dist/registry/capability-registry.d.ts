import type { CapabilityRegistration } from "../types/capability.js";
export declare class CapabilityRegistry {
    private readonly items;
    register(registration: CapabilityRegistration): void;
    get(action: string): CapabilityRegistration | undefined;
    list(): CapabilityRegistration[];
}
