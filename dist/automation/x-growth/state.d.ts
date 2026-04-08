export type XGrowthState = {
    lastPublisherRunAt?: string;
    lastEngageRunAt?: string;
    dailyPostCount: number;
    dailyReplyCount: number;
    failureStreak: number;
    seenContentHashes: string[];
    seenReplyTweetIds: string[];
    blockedReplyTweetIds: string[];
    lastResetDate: string;
};
export declare class XGrowthStateStore {
    private readonly filePath;
    constructor(filePath: string);
    private ensureDir;
    private getDefaultState;
    private normalizeState;
    load(): XGrowthState;
    save(state: XGrowthState): void;
    hashContent(content: string): string;
    addSeenContentHash(state: XGrowthState, hash: string): void;
    addSeenReplyTweetId(state: XGrowthState, tweetId: string): void;
    addBlockedReplyTweetId(state: XGrowthState, tweetId: string): void;
    isBlocked(state: XGrowthState, tweetId: string): boolean;
    recordFailure(state: XGrowthState): void;
    resetFailure(state: XGrowthState): void;
    shouldPauseEngage(state: XGrowthState): boolean;
}
