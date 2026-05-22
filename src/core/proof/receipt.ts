import type { Json } from "../../types/task.js";

export function buildExecutionReceipt(input: {
  taskId: string;
  stepId: string;
  action: string;
  status: "success" | "failed";
  startedAt?: string;
  finishedAt?: string;
  result?: {
    artifacts?: unknown[];
    error?: string;
  };
}) {
  return {
    id: `receipt_${input.taskId}_${input.stepId}`,
    provider: "oneclaw",
    action: input.action,
    status: input.status,
    taskId: input.taskId,
    stepId: input.stepId,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? new Date().toISOString(),
    artifacts: (input.result?.artifacts ?? []).map((item) => String(item)),
    error: input.result?.error ?? null,
  } satisfies Record<string, Json | Json[] | null>;
}
