import type { XSafetyState } from "./types.js";
export type XGuardConfig = {
    minPublisherCooldownMs: number;
    minEngageCooldownMs: number;
    maxDailyPosts: number;
    maxDailyReplies: number;
    maxFailureStreak: number;
};
export declare const defaultXGuardConfig: XGuardConfig;
export declare function canRunPublisher(state: XSafetyState, config: XGuardConfig): {
    ok: boolean;
    reason?: string;
    retryAfterMs?: number;
};
export declare function canRunEngage(state: XSafetyState, config: XGuardConfig): {
    ok: boolean;
    reason?: string;
    retryAfterMs?: number;
};
