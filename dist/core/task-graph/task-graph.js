export class TaskGraph {
    task;
    constructor(task) {
        this.task = task;
    }
    topoOrder() {
        const stepsById = new Map(this.task.steps.map((step) => [step.id, step]));
        const indegree = new Map();
        const outgoing = new Map();
        for (const step of this.task.steps) {
            indegree.set(step.id, step.dependsOn.length);
            for (const dep of step.dependsOn) {
                const arr = outgoing.get(dep) ?? [];
                arr.push(step.id);
                outgoing.set(dep, arr);
            }
        }
        const queue = this.task.steps.filter((step) => step.dependsOn.length === 0).map((step) => step.id);
        const ordered = [];
        while (queue.length > 0) {
            const next = queue.shift();
            ordered.push(stepsById.get(next));
            for (const target of outgoing.get(next) ?? []) {
                const value = (indegree.get(target) ?? 0) - 1;
                indegree.set(target, value);
                if (value === 0)
                    queue.push(target);
            }
        }
        if (ordered.length !== this.task.steps.length) {
            throw new Error("Cycle detected in task graph");
        }
        return ordered;
    }
}
