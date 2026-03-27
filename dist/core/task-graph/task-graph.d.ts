import type { NormalizedTaskDefinition, NormalizedTaskStep } from "../../types/task.js";
export declare class TaskGraph {
    private readonly task;
    constructor(task: NormalizedTaskDefinition);
    topoOrder(): NormalizedTaskStep[];
}
