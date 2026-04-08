export declare class XGrowthRunner {
    private readonly xAdapter;
    private readonly stateStore;
    constructor();
    private getSelfUsername;
    private getSelfUserId;
    private isSelfCandidate;
    private isReplyStep;
    private isPostStep;
    private toExecutableStep;
    private toExecutableSteps;
    private validatePublisherStep;
    private validateEngageStep;
    private logStepSummary;
    private collectRestrictedReplyTargets;
    runPublisher(): Promise<void>;
    runEngage(): Promise<void>;
    runLoop(): Promise<void>;
}
