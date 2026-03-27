import type { NormalizedTaskDefinition } from "../../types/task.js";
type GraphStep = NormalizedTaskDefinition["steps"][number];
export type TaskGraphNode = {
    step: GraphStep;
    dependsOn: string[];
    dependents: string[];
};
export declare class TaskGraph {
    private readonly task;
    private readonly stepMap;
    private readonly nodes;
    constructor(task: NormalizedTaskDefinition);
    private build;
    private validate;
    private assertAcyclic;
    private normalizeRequiredStepId;
    private normalizeOptionalStepId;
    private normalizeDependsOn;
    private buildTopoLayers;
    get size(): number;
    has(stepId: string): boolean;
    get(stepId: string): GraphStep;
    getNode(stepId: string): TaskGraphNode;
    getDependencies(stepId: string): string[];
    getDependents(stepId: string): string[];
    topoOrder(): GraphStep[];
    /**
     * 返回当前“可以执行”的 step。
     * completedStepIds: 已完成的 step id 集合
     * runningStepIds: 正在执行的 step id 集合（可选，用于避免重复调度）
     */
    getRunnableSteps(completedStepIds: Iterable<string>, runningStepIds?: Iterable<string>): GraphStep[];
    /**
     * 判断某一步是否满足执行条件
     */
    isRunnable(stepId: string, completedStepIds: Iterable<string>, runningStepIds?: Iterable<string>): boolean;
    /**
     * 是否存在失败依赖
     */
    hasFailedDependency(stepId: string, failedStepIds: Iterable<string>): boolean;
    /**
     * 某一步是否被阻塞：
     * - 还没完成
     * - 自己不可运行
     * - 且依赖里已经有失败项
     */
    isBlocked(stepId: string, completedStepIds: Iterable<string>, failedStepIds: Iterable<string>, runningStepIds?: Iterable<string>): boolean;
    getBlockedSteps(completedStepIds: Iterable<string>, failedStepIds: Iterable<string>, runningStepIds?: Iterable<string>): GraphStep[];
    /**
     * 返回“层级批次”，适合未来做并行执行。
     * 例如：
     * [[step1], [step2, step3], [step4]]
     */
    getExecutionBatches(): GraphStep[][];
    /**
     * 返回稳定顺序的 step id，方便日志与调试输出一致
     */
    getStableStepIds(): string[];
    /**
     * 返回图的可读摘要，方便日志调试
     */
    summary(): Array<{
        stepId: string;
        action: string;
        dependsOn: string[];
        dependents: string[];
    }>;
}
export {};
