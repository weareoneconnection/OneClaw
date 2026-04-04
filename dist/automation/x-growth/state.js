import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const MAX_SEEN_REPLY_IDS = Math.max(100, Number(process.env.X_GROWTH_MAX_SEEN_REPLY_IDS ?? 1000));
const MAX_SEEN_CONTENT_HASHES = Math.max(100, Number(process.env.X_GROWTH_MAX_SEEN_CONTENT_HASHES ?? 2000));
const DEFAULT_STATE = {
    dailyPostCount: 0,
    dailyReplyCount: 0,
    seenReplyTweetIds: [],
    seenContentHashes: [],
    failureStreak: 0,
    lastResetDate: new Date().toISOString().slice(0, 10),
};
function todayKey() {
    return new Date().toISOString().slice(0, 10);
}
function ensureStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0);
}
function ensureNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function capArray(items, max) {
    if (items.length <= max)
        return items;
    return items.slice(items.length - max);
}
export class XGrowthStateStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                this.ensureDir();
                this.save(DEFAULT_STATE);
                return { ...DEFAULT_STATE };
            }
            const raw = fs.readFileSync(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            const normalized = {
                dailyPostCount: ensureNumber(parsed.dailyPostCount, 0),
                dailyReplyCount: ensureNumber(parsed.dailyReplyCount, 0),
                seenReplyTweetIds: capArray(ensureStringArray(parsed.seenReplyTweetIds), MAX_SEEN_REPLY_IDS),
                seenContentHashes: capArray(ensureStringArray(parsed.seenContentHashes), MAX_SEEN_CONTENT_HASHES),
                failureStreak: ensureNumber(parsed.failureStreak, 0),
                lastPublisherRunAt: String(parsed.lastPublisherRunAt ?? "").trim() || undefined,
                lastEngageRunAt: String(parsed.lastEngageRunAt ?? "").trim() || undefined,
                lastResetDate: String(parsed.lastResetDate ?? "").trim() || todayKey(),
            };
            if (normalized.lastResetDate !== todayKey()) {
                const reset = {
                    ...normalized,
                    dailyPostCount: 0,
                    dailyReplyCount: 0,
                    seenReplyTweetIds: [],
                    seenContentHashes: capArray(normalized.seenContentHashes, MAX_SEEN_CONTENT_HASHES),
                    lastResetDate: todayKey(),
                };
                this.save(reset);
                return reset;
            }
            return normalized;
        }
        catch {
            return { ...DEFAULT_STATE, lastResetDate: todayKey() };
        }
    }
    save(state) {
        this.ensureDir();
        const normalized = {
            dailyPostCount: Math.max(0, ensureNumber(state.dailyPostCount, 0)),
            dailyReplyCount: Math.max(0, ensureNumber(state.dailyReplyCount, 0)),
            seenReplyTweetIds: capArray(ensureStringArray(state.seenReplyTweetIds), MAX_SEEN_REPLY_IDS),
            seenContentHashes: capArray(ensureStringArray(state.seenContentHashes), MAX_SEEN_CONTENT_HASHES),
            failureStreak: Math.max(0, ensureNumber(state.failureStreak, 0)),
            lastPublisherRunAt: String(state.lastPublisherRunAt ?? "").trim() || undefined,
            lastEngageRunAt: String(state.lastEngageRunAt ?? "").trim() || undefined,
            lastResetDate: String(state.lastResetDate ?? "").trim() || todayKey(),
        };
        fs.writeFileSync(this.filePath, JSON.stringify(normalized, null, 2), "utf8");
    }
    hashContent(content) {
        return crypto.createHash("sha256").update(content.trim()).digest("hex");
    }
    addSeenReplyTweetId(state, tweetId) {
        const id = String(tweetId ?? "").trim();
        if (!id)
            return;
        if (!state.seenReplyTweetIds.includes(id)) {
            state.seenReplyTweetIds.push(id);
            state.seenReplyTweetIds = capArray(state.seenReplyTweetIds, MAX_SEEN_REPLY_IDS);
        }
    }
    addSeenContentHash(state, hash) {
        const normalized = String(hash ?? "").trim();
        if (!normalized)
            return;
        if (!state.seenContentHashes.includes(normalized)) {
            state.seenContentHashes.push(normalized);
            state.seenContentHashes = capArray(state.seenContentHashes, MAX_SEEN_CONTENT_HASHES);
        }
    }
    ensureDir() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    }
}
