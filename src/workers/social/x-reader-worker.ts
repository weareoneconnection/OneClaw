import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";
import { XAdapter } from "../../adapters/x/x-adapter.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

function asOptionalString(value: Json | undefined): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function asPositiveNumber(value: Json | undefined): number | undefined {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return undefined;
}

function asStringArray(value: Json | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);

  return items.length ? items : undefined;
}

function toJsonSafe<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export class XReaderWorker implements Worker {
  readonly name = "x_reader_worker";

  constructor(private readonly xAdapter: XAdapter) {}

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`XReaderWorker executing ${context.action}`);

    try {
      switch (context.action) {
        case "x.getTweet": {
          const tweetId = asString(input.tweetId);
          if (!tweetId) {
            return {
              ok: false,
              error: "x.getTweet requires input.tweetId",
            };
          }

          await context.log(`XReaderWorker getTweet tweetId=${tweetId}`);

          const tweet = await this.xAdapter.getTweet(tweetId);

          return {
            ok: true,
            output: {
              action: context.action,
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

          await context.log(
            `XReaderWorker getTweets count=${tweetIds.length}`,
          );

          const tweets = await this.xAdapter.getTweets(tweetIds);

          return {
            ok: true,
            output: {
              action: context.action,
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

          await context.log(
            `XReaderWorker getUserByUsername username=${username}`,
          );

          const user = await this.xAdapter.getUserByUsername(username);

          return {
            ok: true,
            output: {
              action: context.action,
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

          const maxResults = asPositiveNumber(input.maxResults);
          const paginationToken = asOptionalString(input.paginationToken);

          await context.log(
            `XReaderWorker getUserTweets userId=${userId} maxResults=${maxResults ?? 10}`,
          );

          const result = await this.xAdapter.getUserTweets(userId, {
            maxResults,
            paginationToken,
          });

          return {
            ok: true,
            output: {
              action: context.action,
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

          const maxResults = asPositiveNumber(input.maxResults);
          const paginationToken = asOptionalString(input.paginationToken);

          await context.log(
            `XReaderWorker getUserTweetsByUsername username=${username} maxResults=${maxResults ?? 10}`,
          );

          const result = await this.xAdapter.getUserTweetsByUsername(username, {
            maxResults,
            paginationToken,
          });

          return {
            ok: true,
            output: {
              action: context.action,
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

          const maxResults = asPositiveNumber(input.maxResults);
          const paginationToken = asOptionalString(input.paginationToken);

          await context.log(
            `XReaderWorker searchRecentTweets query=${query} maxResults=${maxResults ?? 10}`,
          );

          const result = await this.xAdapter.searchRecentTweets(query, {
            maxResults,
            paginationToken,
          });

          return {
            ok: true,
            output: {
              action: context.action,
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
            error: `Unsupported X reader action: ${context.action}`,
          };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "X reader worker failed";

      await context.log(`XReaderWorker failed: ${message}`);

      return {
        ok: false,
        error: message,
      };
    }
  }
}