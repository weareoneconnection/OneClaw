export declare class OneClawClient {
    private readonly baseUrl;
    constructor(baseUrl: string);
    runTask(input: unknown): Promise<unknown>;
    executeAction(input: unknown): Promise<unknown>;
    getTask(id: string): Promise<unknown>;
}
