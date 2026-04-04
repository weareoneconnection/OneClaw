import type { XSafetyState } from "./types.js";

export type XGuardConfig = {
  minPublisherCooldownMs: number;
  minEngageCooldownMs: number;
  maxDailyPosts: number;
  maxDailyReplies: number;
  maxFailureStreak: number;
};

export const defaultXGuardConfig: XGuardConfig = {
  minPublisherCooldownMs: 6 * 60 * 60 * 1000,
  minEngageCooldownMs: 90 * 60 * 1000,
  maxDailyPosts: 2,
  maxDailyReplies: 4,
  maxFailureStreak: 3,
};

function toMillis(value?: string): number {
  if (!value) return 0;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function safeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function remainingCooldownMs(lastRunAt?: string, cooldownMs?: number): number {
  const last = toMillis(lastRunAt);
  const cd = Number(cooldownMs ?? 0);
  if (!last || cd <= 0) return 0;
  return Math.max(0, cd - (Date.now() - last));
}

export function canRunPublisher(
  state: XSafetyState,
  config: XGuardConfig,
): { ok: boolean; reason?: string; retryAfterMs?: number } {
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

  const retryAfterMs = remainingCooldownMs(
    state.lastPublisherRunAt,
    config.minPublisherCooldownMs,
  );

  if (retryAfterMs > 0) {
    return {
      ok: false,
      reason: "publisher cooldown active",
      retryAfterMs,
    };
  }

  return { ok: true };
}

export function canRunEngage(
  state: XSafetyState,
  config: XGuardConfig,
): { ok: boolean; reason?: string; retryAfterMs?: number } {
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

  const retryAfterMs = remainingCooldownMs(
    state.lastEngageRunAt,
    config.minEngageCooldownMs,
  );

  if (retryAfterMs > 0) {
    return {
      ok: false,
      reason: "engage cooldown active",
      retryAfterMs,
    };
  }

  return { ok: true };
}