import type { Worker } from "../types/capability.js";
export declare class WorkerRegistry {
    private readonly items;
    register(worker: Worker): void;
    get(name: string): Worker | undefined;
}
