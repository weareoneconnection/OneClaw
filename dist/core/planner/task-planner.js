export class TaskPlanner {
    normalize(input, defaultApprovalMode) {
        const seen = new Set();
        const steps = input.steps.map((step) => {
            if (!step.id)
                throw new Error("Each step requires an id");
            if (seen.has(step.id))
                throw new Error(`Duplicate step id: ${step.id}`);
            seen.add(step.id);
            return {
                ...step,
                dependsOn: step.dependsOn ?? [],
                input: step.input ?? {},
            };
        });
        for (const step of steps) {
            for (const dep of step.dependsOn) {
                if (!seen.has(dep))
                    throw new Error(`Unknown dependency '${dep}' for step '${step.id}'`);
            }
        }
        return {
            taskName: input.taskName,
            approvalMode: input.approvalMode ?? defaultApprovalMode,
            metadata: input.metadata,
            steps,
        };
    }
}
