export function buildExecutionReceipt(input) {
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
    };
}
