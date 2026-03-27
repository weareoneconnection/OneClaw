export class TaskGraph {
    task;
    stepMap = new Map();
    nodes = new Map();
    constructor(task) {
        this.task = task;
        this.build();
        this.validate();
    }
    build() {
        for (const rawStep of this.task.steps ?? []) {
            const stepId = this.normalizeRequiredStepId(rawStep.id);
            if (this.stepMap.has(stepId)) {
                throw new Error(`Duplicate step id: ${stepId}`);
            }
            const step = {
                ...rawStep,
                id: stepId,
                dependsOn: this.normalizeDependsOn(rawStep.dependsOn),
            };
            this.stepMap.set(stepId, step);
            this.nodes.set(stepId, {
                step,
                dependsOn: [...step.dependsOn],
                dependents: [],
            });
        }
        for (const [stepId, node] of this.nodes.entries()) {
            for (const depId of node.dependsOn) {
                const depNode = this.nodes.get(depId);
                if (!depNode) {
                    throw new Error(`Step "${stepId}" (${String(node.step.action)}) depends on missing step "${depId}"`);
                }
                if (!depNode.dependents.includes(stepId)) {
                    depNode.dependents.push(stepId);
                }
            }
        }
        for (const node of this.nodes.values()) {
            node.dependents.sort();
        }
    }
    validate() {
        for (const [stepId, node] of this.nodes.entries()) {
            if (node.dependsOn.includes(stepId)) {
                throw new Error(`Step "${stepId}" cannot depend on itself`);
            }
        }
        this.assertAcyclic();
    }
    assertAcyclic() {
        const visiting = new Set();
        const visited = new Set();
        const visit = (stepId, trail) => {
            if (visited.has(stepId))
                return;
            if (visiting.has(stepId)) {
                const cycleStart = trail.indexOf(stepId);
                const cycle = [...trail.slice(cycleStart), stepId].join(" -> ");
                throw new Error(`Cycle detected in task graph: ${cycle}`);
            }
            visiting.add(stepId);
            const node = this.nodes.get(stepId);
            if (!node) {
                throw new Error(`Missing graph node for step "${stepId}"`);
            }
            for (const depId of node.dependsOn) {
                visit(depId, [...trail, stepId]);
            }
            visiting.delete(stepId);
            visited.add(stepId);
        };
        for (const stepId of this.nodes.keys()) {
            visit(stepId, []);
        }
    }
    normalizeRequiredStepId(value) {
        const id = String(value ?? "").trim();
        if (!id) {
            throw new Error("Step id is required");
        }
        return id;
    }
    normalizeOptionalStepId(value) {
        const id = String(value ?? "").trim();
        return id || undefined;
    }
    normalizeDependsOn(value) {
        if (!Array.isArray(value))
            return [];
        const seen = new Set();
        const result = [];
        for (const item of value) {
            const depId = this.normalizeOptionalStepId(item);
            if (!depId)
                continue;
            if (seen.has(depId))
                continue;
            seen.add(depId);
            result.push(depId);
        }
        return result;
    }
    buildTopoLayers(options) {
        const inDegree = new Map();
        const dependentsMap = new Map();
        for (const [stepId, node] of this.nodes.entries()) {
            inDegree.set(stepId, node.dependsOn.length);
            dependentsMap.set(stepId, [...node.dependents]);
        }
        let currentLayer = [...this.nodes.entries()]
            .filter(([_, node]) => node.dependsOn.length === 0)
            .map(([stepId]) => stepId);
        if (options?.sortEachLayer !== false) {
            currentLayer.sort();
        }
        const layers = [];
        let visitedCount = 0;
        while (currentLayer.length > 0) {
            layers.push([...currentLayer]);
            visitedCount += currentLayer.length;
            const nextLayer = [];
            for (const stepId of currentLayer) {
                const dependents = dependentsMap.get(stepId) ?? [];
                for (const dependentId of dependents) {
                    const nextInDegree = (inDegree.get(dependentId) ?? 0) - 1;
                    inDegree.set(dependentId, nextInDegree);
                    if (nextInDegree === 0) {
                        nextLayer.push(dependentId);
                    }
                }
            }
            if (options?.sortEachLayer !== false) {
                nextLayer.sort();
            }
            currentLayer = nextLayer;
        }
        if (visitedCount !== this.nodes.size) {
            throw new Error("Task graph layering failed: unresolved cycle or graph corruption");
        }
        return layers;
    }
    get size() {
        return this.nodes.size;
    }
    has(stepId) {
        return this.nodes.has(stepId);
    }
    get(stepId) {
        const node = this.nodes.get(stepId);
        if (!node) {
            throw new Error(`Step not found: ${stepId}`);
        }
        return node.step;
    }
    getNode(stepId) {
        const node = this.nodes.get(stepId);
        if (!node) {
            throw new Error(`Graph node not found: ${stepId}`);
        }
        return {
            step: node.step,
            dependsOn: [...node.dependsOn],
            dependents: [...node.dependents],
        };
    }
    getDependencies(stepId) {
        return [...this.nodes.get(stepId)?.dependsOn ?? []];
    }
    getDependents(stepId) {
        return [...this.nodes.get(stepId)?.dependents ?? []];
    }
    topoOrder() {
        const layers = this.buildTopoLayers({ sortEachLayer: true });
        const ordered = [];
        for (const layer of layers) {
            for (const stepId of layer) {
                const node = this.nodes.get(stepId);
                if (!node) {
                    throw new Error(`Graph node missing during topo sort: ${stepId}`);
                }
                ordered.push(node.step);
            }
        }
        return ordered;
    }
    /**
     * 返回当前“可以执行”的 step。
     * completedStepIds: 已完成的 step id 集合
     * runningStepIds: 正在执行的 step id 集合（可选，用于避免重复调度）
     */
    getRunnableSteps(completedStepIds, runningStepIds) {
        const completed = new Set(completedStepIds);
        const running = new Set(runningStepIds ?? []);
        const runnable = [];
        for (const stepId of this.getStableStepIds()) {
            const node = this.nodes.get(stepId);
            if (!node)
                continue;
            if (completed.has(stepId))
                continue;
            if (running.has(stepId))
                continue;
            const ready = node.dependsOn.every((depId) => completed.has(depId));
            if (ready) {
                runnable.push(node.step);
            }
        }
        return runnable;
    }
    /**
     * 判断某一步是否满足执行条件
     */
    isRunnable(stepId, completedStepIds, runningStepIds) {
        const completed = new Set(completedStepIds);
        const running = new Set(runningStepIds ?? []);
        const node = this.nodes.get(stepId);
        if (!node) {
            throw new Error(`Graph node not found: ${stepId}`);
        }
        if (completed.has(stepId))
            return false;
        if (running.has(stepId))
            return false;
        return node.dependsOn.every((depId) => completed.has(depId));
    }
    /**
     * 是否存在失败依赖
     */
    hasFailedDependency(stepId, failedStepIds) {
        const failed = new Set(failedStepIds);
        const node = this.nodes.get(stepId);
        if (!node) {
            throw new Error(`Graph node not found: ${stepId}`);
        }
        return node.dependsOn.some((depId) => failed.has(depId));
    }
    /**
     * 某一步是否被阻塞：
     * - 还没完成
     * - 自己不可运行
     * - 且依赖里已经有失败项
     */
    isBlocked(stepId, completedStepIds, failedStepIds, runningStepIds) {
        const completed = new Set(completedStepIds);
        if (completed.has(stepId))
            return false;
        if (this.isRunnable(stepId, completed, runningStepIds))
            return false;
        return this.hasFailedDependency(stepId, failedStepIds);
    }
    getBlockedSteps(completedStepIds, failedStepIds, runningStepIds) {
        const blocked = [];
        for (const stepId of this.getStableStepIds()) {
            if (this.isBlocked(stepId, completedStepIds, failedStepIds, runningStepIds)) {
                blocked.push(this.get(stepId));
            }
        }
        return blocked;
    }
    /**
     * 返回“层级批次”，适合未来做并行执行。
     * 例如：
     * [[step1], [step2, step3], [step4]]
     */
    getExecutionBatches() {
        return this.buildTopoLayers({ sortEachLayer: true }).map((layer) => layer.map((stepId) => this.get(stepId)));
    }
    /**
     * 返回稳定顺序的 step id，方便日志与调试输出一致
     */
    getStableStepIds() {
        return this.topoOrder().map((step) => String(step.id));
    }
    /**
     * 返回图的可读摘要，方便日志调试
     */
    summary() {
        return this.getStableStepIds().map((stepId) => {
            const node = this.nodes.get(stepId);
            if (!node) {
                throw new Error(`Graph node missing during summary: ${stepId}`);
            }
            return {
                stepId,
                action: String(node.step.action),
                dependsOn: [...node.dependsOn],
                dependents: [...node.dependents],
            };
        });
    }
}
