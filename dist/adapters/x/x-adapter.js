import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OAuth from "oauth-1.0a";
import mime from "mime-types";
function asTrimmed(value) {
    return String(value ?? "").trim();
}
function isNumericId(value) {
    return /^[0-9]{1,19}$/.test(value);
}
function toQueryString(query) {
    if (!query)
        return "";
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null)
            continue;
        params.set(key, String(value));
    }
    const built = params.toString();
    return built ? `?${built}` : "";
}
export class XAdapter {
    oauth;
    creds;
    requestTimeoutMs;
    maxMediaSizeBytes;
    maxPostLength;
    constructor(creds) {
        this.creds = {
            appKey: creds?.appKey ??
                process.env.X_API_KEY ??
                process.env.X_APP_KEY ??
                process.env.X_CONSUMER_KEY,
            appSecret: creds?.appSecret ??
                process.env.X_API_SECRET ??
                process.env.X_APP_SECRET ??
                process.env.X_CONSUMER_SECRET,
            accessToken: creds?.accessToken ??
                process.env.X_ACCESS_TOKEN ??
                process.env.X_USER_ACCESS_TOKEN,
            accessSecret: creds?.accessSecret ??
                process.env.X_ACCESS_TOKEN_SECRET ??
                process.env.X_ACCESS_SECRET ??
                process.env.X_USER_ACCESS_SECRET,
            bearerToken: creds?.bearerToken ??
                process.env.X_BEARER_TOKEN ??
                process.env.X_APP_BEARER_TOKEN,
            dryRun: creds?.dryRun ??
                String(process.env.X_DRY_RUN ??
                    process.env.ONECLAW_X_DRY_RUN ??
                    "").toLowerCase() === "true",
        };
        this.requestTimeoutMs = Math.max(3000, Number(process.env.X_REQUEST_TIMEOUT_MS ?? 20000));
        this.maxMediaSizeBytes = Math.max(1024 * 1024, Number(process.env.X_MAX_MEDIA_SIZE_BYTES ?? 15 * 1024 * 1024));
        this.maxPostLength = Math.max(50, Number(process.env.X_MAX_POST_LENGTH ?? 280));
        if (this.creds.appKey &&
            this.creds.appSecret &&
            this.creds.accessToken &&
            this.creds.accessSecret) {
            this.oauth = new OAuth({
                consumer: {
                    key: this.creds.appKey,
                    secret: this.creds.appSecret,
                },
                signature_method: "HMAC-SHA1",
                hash_function(baseString, key) {
                    return crypto
                        .createHmac("sha1", key)
                        .update(baseString)
                        .digest("base64");
                },
            });
        }
    }
    // =========================================================
    // Debug helpers
    // =========================================================
    mask(value) {
        const v = asTrimmed(value);
        if (!v)
            return "(empty)";
        if (v.length <= 8)
            return "********";
        return `${v.slice(0, 4)}...${v.slice(-4)}`;
    }
    getConfigSummary() {
        return {
            appKey: this.mask(this.creds.appKey),
            appSecret: this.mask(this.creds.appSecret),
            accessToken: this.mask(this.creds.accessToken),
            accessSecret: this.mask(this.creds.accessSecret),
            bearerToken: this.mask(this.creds.bearerToken),
            dryRun: this.isDryRun(),
            writeConfigured: this.isConfigured(),
            readConfigured: this.isReadConfigured(),
            requestTimeoutMs: this.requestTimeoutMs,
            maxMediaSizeBytes: this.maxMediaSizeBytes,
            maxPostLength: this.maxPostLength,
        };
    }
    // =========================================================
    // Write auth (OAuth 1.0a)
    // =========================================================
    getWriteAuth() {
        if (!this.oauth || !this.creds.accessToken || !this.creds.accessSecret) {
            throw new Error("X write credentials are not fully configured. Required: appKey, appSecret, accessToken, accessSecret");
        }
        return {
            oauth: this.oauth,
            token: {
                key: this.creds.accessToken,
                secret: this.creds.accessSecret,
            },
        };
    }
    async signedFetch(url, init) {
        const { oauth, token } = this.getWriteAuth();
        const requestData = init.data
            ? { url, method: init.method, data: init.data }
            : { url, method: init.method };
        const auth = oauth.authorize(requestData, token);
        const authHeader = oauth.toHeader(auth);
        return this.fetchWithTimeout(url, {
            method: init.method,
            headers: {
                ...authHeader,
                ...(init.headers ?? {}),
            },
            body: init.body ?? null,
        });
    }
    // =========================================================
    // Read auth (Bearer)
    // =========================================================
    getReadAuthHeader() {
        const bearer = asTrimmed(this.creds.bearerToken);
        if (!bearer) {
            throw new Error("X bearer token is not configured");
        }
        return {
            Authorization: `Bearer ${bearer}`,
        };
    }
    async bearerFetch(url, init) {
        const authHeaders = this.getReadAuthHeader();
        return this.fetchWithTimeout(url, {
            method: init?.method ?? "GET",
            headers: {
                ...authHeaders,
                ...(init?.headers ?? {}),
            },
        });
    }
    // =========================================================
    // Core fetch helpers
    // =========================================================
    async fetchWithTimeout(url, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        try {
            return await fetch(url, {
                ...init,
                signal: controller.signal,
            });
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`X request timeout after ${this.requestTimeoutMs}ms`);
            }
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async parseJsonOrThrow(response, label) {
        const contentType = response.headers.get("content-type") ?? "";
        const rawText = await response.text();
        if (!response.ok) {
            throw new Error(`${label} failed: ${response.status} ${rawText}`);
        }
        if (!contentType.toLowerCase().includes("application/json")) {
            throw new Error(`${label} failed: expected JSON response, got ${contentType || "unknown"} ${rawText}`);
        }
        try {
            return JSON.parse(rawText);
        }
        catch (error) {
            throw new Error(`${label} failed: invalid JSON response ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // =========================================================
    // Write auth verification
    // =========================================================
    async verifyWriteAccess() {
        try {
            const response = await this.signedFetch("https://api.twitter.com/1.1/account/verify_credentials.json", {
                method: "GET",
            });
            const contentType = response.headers.get("content-type") ?? "";
            const raw = await response.text();
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    detail: raw,
                };
            }
            return {
                ok: true,
                status: response.status,
                data: contentType.includes("application/json") ? JSON.parse(raw) : raw,
            };
        }
        catch (error) {
            return {
                ok: false,
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    }
    // =========================================================
    // Write methods
    // =========================================================
    async uploadMedia(mediaPath) {
        const normalizedPath = asTrimmed(mediaPath);
        if (!normalizedPath) {
            throw new Error("Media path is required");
        }
        if (this.creds.dryRun) {
            return `dryrun-${path.basename(normalizedPath)}`;
        }
        if (!fs.existsSync(normalizedPath)) {
            throw new Error(`Media file not found: ${normalizedPath}`);
        }
        const stat = fs.statSync(normalizedPath);
        if (!stat.isFile()) {
            throw new Error(`Media path is not a file: ${normalizedPath}`);
        }
        if (stat.size <= 0) {
            throw new Error(`Media file is empty: ${normalizedPath}`);
        }
        if (stat.size > this.maxMediaSizeBytes) {
            throw new Error(`Media file too large: ${normalizedPath} (${stat.size} bytes > ${this.maxMediaSizeBytes} bytes)`);
        }
        const buffer = fs.readFileSync(normalizedPath);
        const mimeType = mime.lookup(normalizedPath) || "application/octet-stream";
        const fileName = path.basename(normalizedPath);
        const url = "https://upload.twitter.com/1.1/media/upload.json";
        const form = new FormData();
        form.append("media", new Blob([buffer], { type: String(mimeType) }), fileName);
        const response = await this.signedFetch(url, {
            method: "POST",
            body: form,
        });
        const payload = await this.parseJsonOrThrow(response, "X media upload");
        if (!payload.media_id_string) {
            throw new Error("X media upload missing media_id_string");
        }
        return payload.media_id_string;
    }
    async createPost(params) {
        const text = asTrimmed(params.text);
        if (!text) {
            throw new Error("Post text is required");
        }
        if (text.length > this.maxPostLength) {
            throw new Error(`Post text too long: ${text.length} characters (max ${this.maxPostLength})`);
        }
        const replyToTweetId = asTrimmed(params.replyToTweetId);
        const mediaPaths = params.mediaPaths
            ?.map((item) => asTrimmed(item))
            .filter((item) => item.length > 0) ?? [];
        console.log("[XAdapter] createPost", {
            ...this.getConfigSummary(),
            textLength: text.length,
            hasReply: Boolean(replyToTweetId),
            mediaCount: mediaPaths.length,
        });
        if (this.creds.dryRun) {
            return {
                data: {
                    id: `dryrun-${Date.now()}`,
                    text,
                    media: mediaPaths,
                    replyToTweetId: replyToTweetId || null,
                },
            };
        }
        if (!this.isConfigured()) {
            throw new Error("X write credentials are not fully configured. Required: appKey, appSecret, accessToken, accessSecret");
        }
        if (replyToTweetId && !isNumericId(replyToTweetId)) {
            throw new Error("Invalid replyToTweetId: must be a numeric tweet ID (1-19 digits)");
        }
        const verify = await this.verifyWriteAccess();
        if (!verify.ok) {
            throw new Error(`X write auth verification failed before posting. ` +
                `This usually means your OAuth 1.0a user token/secret is wrong, ` +
                `or the app does not have Read and Write permission, ` +
                `or you changed app permission but did not regenerate Access Token/Secret. ` +
                `status=${verify.status ?? "unknown"} detail=${verify.detail ?? "unknown"}`);
        }
        const mediaIds = mediaPaths.length
            ? await Promise.all(mediaPaths.map((item) => this.uploadMedia(item)))
            : [];
        const body = {
            text,
        };
        if (replyToTweetId) {
            body.reply = {
                in_reply_to_tweet_id: replyToTweetId,
            };
        }
        if (mediaIds.length) {
            body.media = {
                media_ids: mediaIds,
            };
        }
        const url = "https://api.twitter.com/2/tweets";
        const response = await this.signedFetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        return this.parseJsonOrThrow(response, "X create post");
    }
    async tweet(text) {
        return this.createPost({ text });
    }
    async reply(text, replyToTweetId) {
        return this.createPost({ text, replyToTweetId });
    }
    // =========================================================
    // Read mapping helpers
    // =========================================================
    mapTweet(raw) {
        return {
            id: asTrimmed(raw?.id),
            text: asTrimmed(raw?.text),
            authorId: asTrimmed(raw?.author_id) || undefined,
            createdAt: asTrimmed(raw?.created_at) || undefined,
            conversationId: asTrimmed(raw?.conversation_id) || undefined,
            referencedTweets: Array.isArray(raw?.referenced_tweets)
                ? raw.referenced_tweets
                    .map((item) => ({
                    type: asTrimmed(item?.type),
                    id: asTrimmed(item?.id),
                }))
                    .filter((item) => item.type && item.id)
                : undefined,
        };
    }
    mapUser(raw) {
        return {
            id: asTrimmed(raw?.id),
            username: asTrimmed(raw?.username),
            name: asTrimmed(raw?.name) || undefined,
        };
    }
    // =========================================================
    // Read methods
    // =========================================================
    async getTweet(tweetId) {
        const id = asTrimmed(tweetId);
        if (!isNumericId(id)) {
            throw new Error("tweetId must be a numeric tweet ID");
        }
        const query = toQueryString({
            "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
        });
        const url = `https://api.twitter.com/2/tweets/${id}${query}`;
        const response = await this.bearerFetch(url);
        const payload = await this.parseJsonOrThrow(response, "X getTweet");
        if (!payload.data)
            return null;
        return this.mapTweet(payload.data);
    }
    async getTweets(tweetIds) {
        const ids = tweetIds
            .map((item) => asTrimmed(item))
            .filter((item) => isNumericId(item));
        if (!ids.length)
            return [];
        const query = toQueryString({
            ids: ids.join(","),
            "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
        });
        const url = `https://api.twitter.com/2/tweets${query}`;
        const response = await this.bearerFetch(url);
        const payload = await this.parseJsonOrThrow(response, "X getTweets");
        return Array.isArray(payload.data)
            ? payload.data.map((item) => this.mapTweet(item))
            : [];
    }
    async getUserByUsername(username) {
        const normalized = asTrimmed(username).replace(/^@/, "");
        if (!normalized) {
            throw new Error("username is required");
        }
        const query = toQueryString({
            "user.fields": "name,username",
        });
        const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(normalized)}${query}`;
        const response = await this.bearerFetch(url);
        const payload = await this.parseJsonOrThrow(response, "X getUserByUsername");
        if (!payload.data)
            return null;
        return this.mapUser(payload.data);
    }
    async getUserTweets(userId, options) {
        const id = asTrimmed(userId);
        if (!isNumericId(id)) {
            throw new Error("userId must be a numeric user ID");
        }
        const maxResults = Math.max(5, Math.min(100, Number(options?.maxResults ?? 10)));
        const query = toQueryString({
            max_results: maxResults,
            pagination_token: asTrimmed(options?.paginationToken) || undefined,
            "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
        });
        const url = `https://api.twitter.com/2/users/${id}/tweets${query}`;
        const response = await this.bearerFetch(url);
        const payload = await this.parseJsonOrThrow(response, "X getUserTweets");
        return {
            user: null,
            tweets: Array.isArray(payload.data)
                ? payload.data.map((item) => this.mapTweet(item))
                : [],
            nextToken: asTrimmed(payload.meta?.next_token) || undefined,
        };
    }
    async getUserTweetsByUsername(username, options) {
        const user = await this.getUserByUsername(username);
        if (!user) {
            return {
                user: null,
                tweets: [],
            };
        }
        const tweetsResult = await this.getUserTweets(user.id, options);
        return {
            user,
            tweets: tweetsResult.tweets,
            nextToken: tweetsResult.nextToken,
        };
    }
    async searchRecentTweets(query, options) {
        const normalizedQuery = asTrimmed(query);
        if (!normalizedQuery) {
            throw new Error("search query is required");
        }
        const maxResults = Math.max(10, Math.min(100, Number(options?.maxResults ?? 10)));
        const queryString = toQueryString({
            query: normalizedQuery,
            max_results: maxResults,
            next_token: asTrimmed(options?.paginationToken) || undefined,
            "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
        });
        const url = `https://api.twitter.com/2/tweets/search/recent${queryString}`;
        const response = await this.bearerFetch(url);
        const payload = await this.parseJsonOrThrow(response, "X searchRecentTweets");
        const x = new XAdapter();
        console.log("[XAdapter] config", x.getConfigSummary());
        const verify = await x.verifyWriteAccess();
        console.log("[XAdapter] verifyWriteAccess", verify);
        return {
            tweets: Array.isArray(payload.data)
                ? payload.data.map((item) => this.mapTweet(item))
                : [],
            nextToken: asTrimmed(payload.meta?.next_token) || undefined,
        };
    }
    // =========================================================
    // State helpers
    // =========================================================
    isConfigured() {
        return Boolean(this.creds.appKey &&
            this.creds.appSecret &&
            this.creds.accessToken &&
            this.creds.accessSecret);
    }
    isReadConfigured() {
        return Boolean(this.creds.bearerToken);
    }
    isDryRun() {
        return Boolean(this.creds.dryRun);
    }
}
