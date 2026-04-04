export const defaultXGuardConfig = {
    minPublisherCooldownMs: 15 * 60 * 1000, // 15分钟
    minEngageCooldownMs: 20 * 60 * 1000,
    maxDailyPosts: 6,
    maxDailyReplies: 15,
    maxFailureStreak: 3,
};
function toMillis(value) {
    if (!value)
        return 0;
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
}
function safeCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}
function remainingCooldownMs(lastRunAt, cooldownMs) {
    const last = toMillis(lastRunAt);
    const cd = Number(cooldownMs ?? 0);
    if (!last || cd <= 0)
        return 0;
    return Math.max(0, cd - (Date.now() - last));
}
export function canRunPublisher(state, config) {
    const failureStreak = safeCount(state.failureStreak);
    const dailyPostCount = safeCount(state.dailyPostCount);
    if (failureStreak >= config.maxFailureStreak) {
        return {
            ok: false,
            reason: "publisher blocked by failure circuit breaker",
        };
    }
    if (dailyPostCount >= config.maxDailyPosts) {
        return {
            ok: false,
            reason: "publisher daily post limit reached",
        };
    }
    const retryAfterMs = remainingCooldownMs(state.lastPublisherRunAt, config.minPublisherCooldownMs);
    if (retryAfterMs > 0) {
        return {
            ok: false,
            reason: "publisher cooldown active",
            retryAfterMs,
        };
    }
    return { ok: true };
}
export function canRunEngage(state, config) {
    const failureStreak = safeCount(state.failureStreak);
    const dailyReplyCount = safeCount(state.dailyReplyCount);
    if (failureStreak >= config.maxFailureStreak) {
        return {
            ok: false,
            reason: "engage blocked by failure circuit breaker",
        };
    }
    if (dailyReplyCount >= config.maxDailyReplies) {
        return {
            ok: false,
            reason: "engage daily reply limit reached",
        };
    }
    const retryAfterMs = remainingCooldownMs(state.lastEngageRunAt, config.minEngageCooldownMs);
    if (retryAfterMs > 0) {
        return {
            ok: false,
            reason: "engage cooldown active",
            retryAfterMs,
        };
    }
    return { ok: true };
}
