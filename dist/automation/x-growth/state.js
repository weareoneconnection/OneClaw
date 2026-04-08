import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
function safeArray(value) {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0)));
}
function getDateKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}
export class XGrowthStateStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    ensureDir() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    }
    getDefaultState() {
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
    normalizeState(raw) {
        const base = this.getDefaultState();
        const input = raw && typeof raw === "object" ? raw : {};
        const today = getDateKey();
        const normalized = {
            lastPublisherRunAt: String(input.lastPublisherRunAt ?? "").trim() || undefined,
            lastEngageRunAt: String(input.lastEngageRunAt ?? "").trim() || undefined,
            dailyPostCount: typeof input.dailyPostCount === "number" &&
                Number.isFinite(input.dailyPostCount)
                ? input.dailyPostCount
                : base.dailyPostCount,
            dailyReplyCount: typeof input.dailyReplyCount === "number" &&
                Number.isFinite(input.dailyReplyCount)
                ? input.dailyReplyCount
                : base.dailyReplyCount,
            failureStreak: typeof input.failureStreak === "number" &&
                Number.isFinite(input.failureStreak)
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
            normalized.failureStreak = 0;
            normalized.lastResetDate = today;
        }
        return normalized;
    }
    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                const state = this.getDefaultState();
                console.log("[x-growth-state] load default =", this.filePath);
                return state;
            }
            const raw = fs.readFileSync(this.filePath, "utf8");
            if (!raw.trim()) {
                const state = this.getDefaultState();
                console.log("[x-growth-state] load empty file, using default =", this.filePath);
                return state;
            }
            const parsed = this.normalizeState(JSON.parse(raw));
            console.log("[x-growth-state] loaded from =", this.filePath);
            console.log("[x-growth-state] loaded payload =", JSON.stringify(parsed, null, 2));
            return parsed;
        }
        catch (error) {
            console.error("[x-growth-state] load failed, using defaults:", error);
            return this.getDefaultState();
        }
    }
    save(state) {
        this.ensureDir();
        const normalized = this.normalizeState(state);
        console.log("[x-growth-state] saving to =", this.filePath);
        console.log("[x-growth-state] payload =", JSON.stringify(normalized, null, 2));
        fs.writeFileSync(this.filePath, JSON.stringify(normalized, null, 2), "utf8");
    }
    hashContent(content) {
        return crypto
            .createHash("sha256")
            .update(String(content ?? "").trim())
            .digest("hex");
    }
    addSeenContentHash(state, hash) {
        const value = String(hash ?? "").trim();
        if (!value)
            return;
        if (!state.seenContentHashes.includes(value)) {
            state.seenContentHashes.push(value);
        }
        if (state.seenContentHashes.length > 5000) {
            state.seenContentHashes = state.seenContentHashes.slice(-5000);
        }
    }
    addSeenReplyTweetId(state, tweetId) {
        const value = String(tweetId ?? "").trim();
        if (!value)
            return;
        if (!state.seenReplyTweetIds.includes(value)) {
            console.log("[x-growth-state] add SEEN reply tweet =", value);
            state.seenReplyTweetIds.push(value);
        }
        if (state.seenReplyTweetIds.length > 5000) {
            state.seenReplyTweetIds = state.seenReplyTweetIds.slice(-5000);
        }
    }
    addBlockedReplyTweetId(state, tweetId) {
        const value = String(tweetId ?? "").trim();
        if (!value)
            return;
        if (!state.blockedReplyTweetIds.includes(value)) {
            console.log("[x-growth-state] add BLOCKED tweet =", value);
            state.blockedReplyTweetIds.push(value);
        }
        if (state.blockedReplyTweetIds.length > 5000) {
            state.blockedReplyTweetIds = state.blockedReplyTweetIds.slice(-5000);
        }
    }
    isBlocked(state, tweetId) {
        const value = String(tweetId ?? "").trim();
        if (!value)
            return false;
        return state.blockedReplyTweetIds.includes(value);
    }
    recordFailure(state) {
        state.failureStreak += 1;
        console.log("[x-growth-state] failureStreak =", state.failureStreak);
    }
    resetFailure(state) {
        if (state.failureStreak !== 0) {
            console.log("[x-growth-state] reset failureStreak");
        }
        state.failureStreak = 0;
    }
    shouldPauseEngage(state) {
        return state.failureStreak >= 3;
    }
}
