import type { XSafetyState } from "./types.js";
export declare class XGrowthStateStore {
    private readonly filePath;
    constructor(filePath: string);
    load(): XSafetyState;
    save(state: XSafetyState): void;
    hashContent(content: string): string;
    addSeenReplyTweetId(state: XSafetyState, tweetId: string): void;
    addSeenContentHash(state: XSafetyState, hash: string): void;
    private ensureDir;
}
