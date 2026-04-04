function asString(value) {
    return String(value ?? "").trim();
}
function asOptionalString(value) {
    const text = String(value ?? "").trim();
    return text ? text : undefined;
}
function asPositiveNumber(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0)
        return num;
    return undefined;
}
function asBoundedPositiveNumber(value, min, max) {
    const num = asPositiveNumber(value);
    if (num === undefined)
        return undefined;
    return Math.max(min, Math.min(max, num));
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
function truncateForLog(value, max = 120) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, max)}...`;
}
function isNumericId(value) {
    return /^[0-9]{1,19}$/.test(value);
}
function toJsonSafe(value) {
    return JSON.parse(JSON.stringify(value));
}
export class XReaderWorker {
    xAdapter;
    name = "x_reader_worker";
    constructor(xAdapter) {
        this.xAdapter = xAdapter;
    }
    async execute(input, context) {
        const action = asString(context.action);
        await context.log(`XReaderWorker executing ${action || "unknown"}`);
        try {
            switch (action) {
                case "x.getTweet": {
                    const tweetId = asString(input.tweetId);
                    if (!tweetId) {
                        return {
                            ok: false,
                            error: "x.getTweet requires input.tweetId",
                        };
                    }
                    if (!isNumericId(tweetId)) {
                        return {
                            ok: false,
                            error: "x.getTweet requires input.tweetId to be a numeric tweet ID",
                        };
                    }
                    await context.log(`XReaderWorker getTweet tweetId=${tweetId}`);
                    const tweet = await this.xAdapter.getTweet(tweetId);
                    return {
                        ok: true,
                        output: {
                            action,
                            tweetId,
                            found: Boolean(tweet),
                            tweet: tweet ? toJsonSafe(tweet) : null,
                        },
                    };
                }
                case "x.getTweets": {
                    const tweetIds = asStringArray(input.tweetIds);
                    if (!tweetIds?.length) {
                        return {
                            ok: false,
                            error: "x.getTweets requires input.tweetIds as a non-empty array",
                        };
                    }
                    const invalidTweetId = tweetIds.find((item) => !isNumericId(item));
                    if (invalidTweetId) {
                        return {
                            ok: false,
                            error: `x.getTweets received invalid numeric tweet ID: ${invalidTweetId}`,
                        };
                    }
                    await context.log(`XReaderWorker getTweets count=${tweetIds.length}`);
                    const tweets = await this.xAdapter.getTweets(tweetIds);
                    return {
                        ok: true,
                        output: {
                            action,
                            requestedCount: tweetIds.length,
                            returnedCount: tweets.length,
                            tweets: toJsonSafe(tweets),
                        },
                    };
                }
                case "x.getUserByUsername": {
                    const username = asString(input.username);
                    if (!username) {
                        return {
                            ok: false,
                            error: "x.getUserByUsername requires input.username",
                        };
                    }
                    await context.log(`XReaderWorker getUserByUsername username=${truncateForLog(username, 60)}`);
                    const user = await this.xAdapter.getUserByUsername(username);
                    return {
                        ok: true,
                        output: {
                            action,
                            username,
                            found: Boolean(user),
                            user: user ? toJsonSafe(user) : null,
                        },
                    };
                }
                case "x.getUserTweets": {
                    const userId = asString(input.userId);
                    if (!userId) {
                        return {
                            ok: false,
                            error: "x.getUserTweets requires input.userId",
                        };
                    }
                    if (!isNumericId(userId)) {
                        return {
                            ok: false,
                            error: "x.getUserTweets requires input.userId to be a numeric user ID",
                        };
                    }
                    const maxResults = asBoundedPositiveNumber(input.maxResults, 5, 100);
                    const paginationToken = asOptionalString(input.paginationToken);
                    await context.log(`XReaderWorker getUserTweets userId=${userId} maxResults=${maxResults ?? 10}`);
                    const result = await this.xAdapter.getUserTweets(userId, {
                        maxResults,
                        paginationToken,
                    });
                    return {
                        ok: true,
                        output: {
                            action,
                            userId,
                            tweetsCount: result.tweets.length,
                            nextToken: result.nextToken ?? null,
                            user: result.user ? toJsonSafe(result.user) : null,
                            tweets: toJsonSafe(result.tweets),
                        },
                    };
                }
                case "x.getUserTweetsByUsername": {
                    const username = asString(input.username);
                    if (!username) {
                        return {
                            ok: false,
                            error: "x.getUserTweetsByUsername requires input.username",
                        };
                    }
                    const maxResults = asBoundedPositiveNumber(input.maxResults, 5, 100);
                    const paginationToken = asOptionalString(input.paginationToken);
                    await context.log(`XReaderWorker getUserTweetsByUsername username=${truncateForLog(username, 60)} maxResults=${maxResults ?? 10}`);
                    const result = await this.xAdapter.getUserTweetsByUsername(username, {
                        maxResults,
                        paginationToken,
                    });
                    return {
                        ok: true,
                        output: {
                            action,
                            username,
                            tweetsCount: result.tweets.length,
                            nextToken: result.nextToken ?? null,
                            user: result.user ? toJsonSafe(result.user) : null,
                            tweets: toJsonSafe(result.tweets),
                        },
                    };
                }
                case "x.searchRecentTweets": {
                    const query = asString(input.query);
                    if (!query) {
                        return {
                            ok: false,
                            error: "x.searchRecentTweets requires input.query",
                        };
                    }
                    const maxResults = asBoundedPositiveNumber(input.maxResults, 10, 100);
                    const paginationToken = asOptionalString(input.paginationToken);
                    await context.log(`XReaderWorker searchRecentTweets query=${truncateForLog(query)} maxResults=${maxResults ?? 10}`);
                    const result = await this.xAdapter.searchRecentTweets(query, {
                        maxResults,
                        paginationToken,
                    });
                    return {
                        ok: true,
                        output: {
                            action,
                            query,
                            tweetsCount: result.tweets.length,
                            nextToken: result.nextToken ?? null,
                            tweets: toJsonSafe(result.tweets),
                        },
                    };
                }
                default:
                    return {
                        ok: false,
                        error: `Unsupported X reader action: ${action}`,
                    };
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "X reader worker failed";
            await context.log(`XReaderWorker failed: ${message}`);
            return {
                ok: false,
                error: message,
            };
        }
    }
}
