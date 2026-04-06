import fs from "node:fs";
import path from "node:path";
function asString(value) {
    return String(value ?? "").trim();
}
function asOptionalString(value) {
    const text = String(value ?? "").trim();
    return text ? text : undefined;
}
function asBoolean(value, fallback = false) {
    if (typeof value === "boolean")
        return value;
    const text = String(value ?? "").trim().toLowerCase();
    if (!text)
        return fallback;
    if (["1", "true", "yes", "y", "on"].includes(text))
        return true;
    if (["0", "false", "no", "n", "off"].includes(text))
        return false;
    return fallback;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0);
    if (!items.length)
        return undefined;
    return Array.from(new Set(items));
}
function isValidTweetId(value) {
    return /^[0-9]{1,19}$/.test(value);
}
function truncateForLog(value, max = 120) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, max)}...`;
}
function safeJsonStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function normalizeChannel(value) {
    const text = asString(value || "x").toLowerCase();
    if (text === "twitter")
        return "x";
    return text;
}
function normalizeAction(value) {
    return String(value ?? "").trim().toLowerCase();
}
function getErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error || "Unknown error");
}
function classifyXError(message) {
    const text = message.toLowerCase();
    if (text.includes("not fully configured") ||
        text.includes("bearer token is not configured")) {
        return { code: "X_CONFIG_ERROR", retryable: false };
    }
    if (text.includes("401") ||
        text.includes("unauthorized") ||
        text.includes("write auth verification failed")) {
        return { code: "X_AUTH_ERROR", retryable: false };
    }
    if (text.includes("403") || text.includes("forbidden")) {
        return { code: "X_PERMISSION_ERROR", retryable: false };
    }
    if (text.includes("429") || text.includes("rate limit")) {
        return { code: "X_RATE_LIMIT", retryable: true };
    }
    if (text.includes("timeout") ||
        text.includes("network") ||
        text.includes("fetch failed") ||
        text.includes("econnreset") ||
        text.includes("socket hang up")) {
        return { code: "X_NETWORK_ERROR", retryable: true };
    }
    if (text.includes("media file not found") ||
        text.includes("media file is empty") ||
        text.includes("media path is not a file") ||
        text.includes("media file too large")) {
        return { code: "X_MEDIA_ERROR", retryable: false };
    }
    if (text.includes("too long") ||
        text.includes("missing social content") ||
        text.includes("invalid replytotweetid")) {
        return { code: "X_INPUT_ERROR", retryable: false };
    }
    return { code: "X_POST_FAILED", retryable: false };
}
export class SocialWorker {
    xAdapter;
    name = "social_worker";
    constructor(xAdapter) {
        this.xAdapter = xAdapter;
        console.log("[SocialWorker] x summary", xAdapter.getConfigSummary?.());
        console.log("[SocialWorker] x write configured", xAdapter.isConfigured());
        console.log("[SocialWorker] x read configured", xAdapter.isReadConfigured());
        console.log("[SocialWorker] x dry run", xAdapter.isDryRun());
    }
    async log(context, message) {
        await context.log(message);
    }
    validateMediaPaths(mediaPaths) {
        if (!mediaPaths?.length)
            return [];
        if (mediaPaths.length > 4) {
            throw new Error(`Too many media files: ${mediaPaths.length} (max 4)`);
        }
        const prepared = [];
        for (const mediaPath of mediaPaths) {
            const resolvedPath = path.resolve(mediaPath);
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Media file not found: ${resolvedPath}`);
            }
            const stat = fs.statSync(resolvedPath);
            if (!stat.isFile()) {
                throw new Error(`Media path is not a file: ${resolvedPath}`);
            }
            if (stat.size <= 0) {
                throw new Error(`Media file is empty: ${resolvedPath}`);
            }
            prepared.push({
                originalPath: mediaPath,
                resolvedPath,
                fileName: path.basename(resolvedPath),
                size: stat.size,
            });
        }
        return prepared;
    }
    buildSuccessOutput(args) {
        const responseJson = typeof args.response === "object" && args.response !== null
            ? args.response
            : { value: String(args.response) };
        return {
            published: true,
            worker: this.name,
            action: args.action,
            channel: args.channel,
            content: args.content,
            contentLength: args.content.length,
            replyToTweetId: args.replyToTweetId ?? null,
            hasReply: Boolean(args.replyToTweetId),
            mediaCount: args.mediaFiles.length,
            mediaFiles: args.mediaFiles.map((item) => item.resolvedPath),
            response: responseJson,
        };
    }
    async execute(input, context) {
        const action = normalizeAction(context.action);
        const channel = normalizeChannel(input.channel || "x");
        const skipVerify = asBoolean(input.skipVerifyWriteAccess, false);
        await this.log(context, `SocialWorker executing action=${action || "unknown"} channel=${channel}`);
        try {
            if (action !== "social.post") {
                return {
                    ok: false,
                    error: `Unsupported social action: ${action || "unknown"}`,
                };
            }
            if (channel !== "x") {
                return {
                    ok: false,
                    error: `Unsupported social channel: ${channel}`,
                };
            }
            const xSummary = typeof this.xAdapter.getConfigSummary === "function"
                ? this.xAdapter.getConfigSummary()
                : {
                    writeConfigured: this.xAdapter.isConfigured(),
                    readConfigured: this.xAdapter.isReadConfigured(),
                    dryRun: this.xAdapter.isDryRun(),
                };
            await this.log(context, `SocialWorker X state=${safeJsonStringify(xSummary)}`);
            console.log("[SocialWorker] state", {
                action,
                channel,
                ...xSummary,
            });
            const content = asString(input.content) ||
                asString(input.text) ||
                asString(input.message);
            if (!content) {
                return {
                    ok: false,
                    error: "Missing social content",
                };
            }
            if (content.length > 280) {
                return {
                    ok: false,
                    error: `Social content too long: ${content.length} characters (max 280)`,
                };
            }
            const replyToTweetId = asOptionalString(input.replyToTweetId) ||
                asOptionalString(input.reply_to_tweet_id);
            if (replyToTweetId && !isValidTweetId(replyToTweetId)) {
                return {
                    ok: false,
                    error: "Invalid replyToTweetId: must be a numeric tweet ID (1-19 digits)",
                };
            }
            const mediaPaths = asStringArray(input.mediaPaths) ||
                asStringArray(input.media_paths) ||
                asStringArray(input.images);
            const mediaFiles = this.validateMediaPaths(mediaPaths);
            await this.log(context, `SocialWorker preparing X post textLength=${content.length} mediaCount=${mediaFiles.length} reply=${replyToTweetId ? "yes" : "no"} preview=${truncateForLog(content, 100)}`);
            console.log("[SocialWorker] preparing X post", {
                textLength: content.length,
                hasReply: Boolean(replyToTweetId),
                mediaCount: mediaFiles.length,
                preview: truncateForLog(content, 100),
                mediaFiles: mediaFiles.map((item) => ({
                    fileName: item.fileName,
                    size: item.size,
                    resolvedPath: item.resolvedPath,
                })),
            });
            if (!this.xAdapter.isDryRun() && !this.xAdapter.isConfigured()) {
                return {
                    ok: false,
                    error: "X write credentials are not fully configured. Required: appKey, appSecret, accessToken, accessSecret",
                };
            }
            if (!this.xAdapter.isDryRun() &&
                !skipVerify &&
                typeof this.xAdapter.verifyWriteAccess === "function") {
                const verify = await this.xAdapter.verifyWriteAccess();
                await this.log(context, `SocialWorker verifyWriteAccess=${safeJsonStringify({
                    ok: verify.ok,
                    status: verify.status,
                    detail: verify.detail
                        ? truncateForLog(String(verify.detail), 240)
                        : undefined,
                })}`);
                console.log("[SocialWorker] verifyWriteAccess", verify);
                if (!verify.ok) {
                    return {
                        ok: false,
                        error: `X write auth verification failed before posting. ` +
                            `This usually means your OAuth 1.0a user token/secret is wrong, ` +
                            `or the X app does not have Read and Write permission, ` +
                            `or you changed app permission but did not regenerate Access Token/Secret. ` +
                            `status=${verify.status ?? "unknown"} detail=${verify.detail ?? "unknown"}`,
                    };
                }
            }
            const response = await this.xAdapter.createPost({
                text: content,
                replyToTweetId,
                mediaPaths: mediaFiles.map((item) => item.resolvedPath),
            });
            await this.log(context, `SocialWorker X response=${truncateForLog(safeJsonStringify(response), 1000)}`);
            console.log("[SocialWorker] X response", response);
            await this.log(context, "SocialWorker X post completed");
            console.log("[SocialWorker] X post completed");
            return {
                ok: true,
                output: this.buildSuccessOutput({
                    action,
                    channel,
                    content,
                    replyToTweetId,
                    mediaFiles,
                    response,
                }),
            };
        }
        catch (error) {
            const message = getErrorMessage(error);
            const classified = classifyXError(message);
            const xSummary = typeof this.xAdapter.getConfigSummary === "function"
                ? this.xAdapter.getConfigSummary()
                : {
                    writeConfigured: this.xAdapter.isConfigured(),
                    readConfigured: this.xAdapter.isReadConfigured(),
                    dryRun: this.xAdapter.isDryRun(),
                };
            await this.log(context, `SocialWorker X state=${safeJsonStringify(xSummary)}`);
            await this.log(context, `SocialWorker failed code=${classified.code} retryable=${classified.retryable} error=${truncateForLog(message, 500)}`);
            console.error("[SocialWorker] failed", {
                ...xSummary,
                code: classified.code,
                retryable: classified.retryable,
                error: message,
            });
            return {
                ok: false,
                error: message,
                output: {
                    published: false,
                    worker: this.name,
                    channel,
                    action,
                    errorCode: classified.code,
                    retryable: classified.retryable,
                },
            };
        }
    }
}
