import type { OneClawAction } from "../../clients/oneclawClient.js";
type OneClawStep = {
    id: string;
    action: OneClawAction;
    input: Record<string, unknown>;
    dependsOn?: string[];
};
type OneClawTask = {
    taskName: string;
    steps: OneClawStep[];
};
export declare function extractOneClawTask(result: unknown): OneClawTask | null;
export {};
