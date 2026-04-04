export declare class XGrowthRunner {
    private readonly xAdapter;
    private readonly stateStore;
    constructor();
    runPublisher(): Promise<void>;
    runEngage(): Promise<void>;
    runLoop(): Promise<void>;
}
