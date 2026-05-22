import type { CapabilityRegistration } from "../types/capability.js";

export class CapabilityRegistry {
  private readonly items = new Map<string, CapabilityRegistration>();

  register(registration: CapabilityRegistration): void {
    this.items.set(registration.action, {
      maturity: "guarded",
      supportsDryRun: false,
      supportsRollback: false,
      approvalRequired: registration.risk === "high" || registration.risk === "critical",
      permissions: [],
      outputContract: [],
      ...registration,
    });
  }

  get(action: string): CapabilityRegistration | undefined {
    return this.items.get(action);
  }

  list(): CapabilityRegistration[] {
    return [...this.items.values()];
  }

  manifest() {
    return this.list().map((item) => ({
      action: item.action,
      workerName: item.workerName,
      domain: item.domain ?? item.action.split(".")[0],
      connectorKey: item.connectorKey ?? item.domain ?? item.action.split(".")[0],
      risk: item.risk,
      maturity: item.maturity ?? "guarded",
      liveMode: item.liveMode ?? "prepared",
      description: item.description,
      approvalRequired: Boolean(item.approvalRequired),
      supportsDryRun: Boolean(item.supportsDryRun),
      supportsRollback: Boolean(item.supportsRollback),
      inputSchema: item.inputSchema ?? { required: [], properties: {} },
      outputContract: item.outputContract ?? [],
      permissions: item.permissions ?? [],
      rateLimit: item.rateLimit ?? null,
      pluginKey: item.pluginKey ?? null,
    }));
  }
}
