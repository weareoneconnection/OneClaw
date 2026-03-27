import type { Worker } from "../types/capability.js";

export class WorkerRegistry {
  private readonly items = new Map<string, Worker>();

  register(worker: Worker): void {
    this.items.set(worker.name, worker);
  }

  get(name: string): Worker | undefined {
    return this.items.get(name);
  }
}
