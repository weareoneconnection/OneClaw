import type { NormalizedTaskDefinition, TaskDefinition } from "../../types/task.js";
export declare class TaskPlanner {
    normalize(input: TaskDefinition, defaultApprovalMode: "auto" | "manual"): NormalizedTaskDefinition;
}
