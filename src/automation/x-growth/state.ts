import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function getDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export class XGrowthStateStore {
  constructor(private readonly filePath: string) {}

  private ensureDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  private getDefaultState(): XGrowthState {
    return {
      dailyPostCount: 0,
      dailyReplyCount: 0,
      failureStreak: 0,
      seenContentHashes: [],
      seenReplyTweetIds: [],
      blockedReplyTweetIds: [],
      lastResetDate: getDateKey(),
    };
  }

  private normalizeState(raw: unknown): XGrowthState {
    const base = this.getDefaultState();
    const input =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    const today = getDateKey();

    const normalized: XGrowthState = {
      lastPublisherRunAt:
        String(input.lastPublisherRunAt ?? "").trim() || undefined,
      lastEngageRunAt:
        String(input.lastEngageRunAt ?? "").trim() || undefined,
      dailyPostCount:
        typeof input.dailyPostCount === "number" && Number.isFinite(input.dailyPostCount)
          ? input.dailyPostCount
          : base.dailyPostCount,
      dailyReplyCount:
        typeof input.dailyReplyCount === "number" && Number.isFinite(input.dailyReplyCount)
          ? input.dailyReplyCount
          : base.dailyReplyCount,
      failureStreak:
        typeof input.failureStreak === "number" && Number.isFinite(input.failureStreak)
          ? input.failureStreak
          : base.failureStreak,
      seenContentHashes: safeArray(input.seenContentHashes),
      seenReplyTweetIds: safeArray(input.seenReplyTweetIds),
      blockedReplyTweetIds: safeArray(input.blockedReplyTweetIds),
      lastResetDate: String(input.lastResetDate ?? "").trim() || today,
    };

    if (normalized.lastResetDate !== today) {
      normalized.dailyPostCount = 0;
      normalized.dailyReplyCount = 0;
      normalized.lastResetDate = today;
    }

    return normalized;
  }

  load(): XGrowthState {
    try {
      if (!fs.existsSync(this.filePath)) {
        return this.getDefaultState();
      }

      const raw = fs.readFileSync(this.filePath, "utf8");
      if (!raw.trim()) {
        return this.getDefaultState();
      }

      return this.normalizeState(JSON.parse(raw));
    } catch (error) {
      console.error("[x-growth-state] load failed, using defaults:", error);
      return this.getDefaultState();
    }
  }

  save(state: XGrowthState): void {
  this.ensureDir();
  const normalized = this.normalizeState(state);

  console.log("[x-growth-state] saving to =", this.filePath);
  console.log("[x-growth-state] payload =", JSON.stringify(normalized, null, 2));

  fs.writeFileSync(this.filePath, JSON.stringify(normalized, null, 2), "utf8");
}

  hashContent(content: string): string {
    return crypto
      .createHash("sha256")
      .update(String(content ?? "").trim())
      .digest("hex");
  }

  addSeenContentHash(state: XGrowthState, hash: string): void {
    const value = String(hash ?? "").trim();
    if (!value) return;
    if (!state.seenContentHashes.includes(value)) {
      state.seenContentHashes.push(value);
    }
    if (state.seenContentHashes.length > 5000) {
      state.seenContentHashes = state.seenContentHashes.slice(-5000);
    }
  }

  addSeenReplyTweetId(state: XGrowthState, tweetId: string): void {
    const value = String(tweetId ?? "").trim();
    if (!value) return;
    if (!state.seenReplyTweetIds.includes(value)) {
      state.seenReplyTweetIds.push(value);
    }
    if (state.seenReplyTweetIds.length > 5000) {
      state.seenReplyTweetIds = state.seenReplyTweetIds.slice(-5000);
    }
  }

  addBlockedReplyTweetId(state: XGrowthState, tweetId: string): void {
    const value = String(tweetId ?? "").trim();
    if (!value) return;
    if (!state.blockedReplyTweetIds.includes(value)) {
      state.blockedReplyTweetIds.push(value);
    }
    if (state.blockedReplyTweetIds.length > 5000) {
      state.blockedReplyTweetIds = state.blockedReplyTweetIds.slice(-5000);
    }
  }
}