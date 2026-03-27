import type { CapabilityRegistration } from "../types/capability.js";

export class CapabilityRegistry {
  private readonly items = new Map<string, CapabilityRegistration>();

  register(registration: CapabilityRegistration): void {
    this.items.set(registration.action, registration);
  }

  get(action: string): CapabilityRegistration | undefined {
    return this.items.get(action);
  }

  list(): CapabilityRegistration[] {
    return [...this.items.values()];
  }
}
