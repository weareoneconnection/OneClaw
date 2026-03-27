import type { StepStatus, TaskStepResult } from "../../types/task.js";

export function buildStepResult(params: {
  stepId: string;
  action: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  output?: TaskStepResult["output"];
  error?: string;
  artifacts?: string[];
}): TaskStepResult {
  return { ...params };
}
