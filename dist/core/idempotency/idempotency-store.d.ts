export type IdempotencyRecord = {
    key: string;
    taskId: string;
    createdAt: string;
};
export declare class IdempotencyStore {
    private readonly records;
    get(key: string): IdempotencyRecord | undefined;
    set(key: string, taskId: string): {
        key: string;
        taskId: string;
        createdAt: string;
    };
}
