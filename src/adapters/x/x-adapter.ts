import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OAuth from "oauth-1.0a";
import mime from "mime-types";

export interface XCreatePostParams {
  text: string;
  replyToTweetId?: string;
  mediaPaths?: string[];
}

export type XAdapterCreds = {
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  bearerToken?: string;
  dryRun?: boolean;
};

export type XTweetReference = {
  type: string;
  id: string;
};

export type XTweet = {
  id: string;
  text: string;
  authorId?: string;
  createdAt?: string;
  conversationId?: string;
  referencedTweets?: XTweetReference[];
};

export type XUser = {
  id: string;
  username: string;
  name?: string;
};

export type XSearchResponse = {
  tweets: XTweet[];
  nextToken?: string;
};

export type XUserTweetsResponse = {
  user: XUser | null;
  tweets: XTweet[];
  nextToken?: string;
};

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

function isNumericId(value: string): boolean {
  return /^[0-9]{1,19}$/.test(value);
}

function toQueryString(
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  const built = params.toString();
  return built ? `?${built}` : "";
}

export class XAdapter {
  private readonly oauth?: OAuth;
  private readonly creds: XAdapterCreds;

  constructor(creds?: XAdapterCreds) {
    this.creds = {
      appKey: creds?.appKey ?? process.env.X_API_KEY ?? process.env.X_APP_KEY,
      appSecret:
        creds?.appSecret ?? process.env.X_API_SECRET ?? process.env.X_APP_SECRET,
      accessToken:
        creds?.accessToken ??
        process.env.X_ACCESS_TOKEN,
      accessSecret:
        creds?.accessSecret ??
        process.env.X_ACCESS_SECRET,
      bearerToken:
        creds?.bearerToken ??
        process.env.X_BEARER_TOKEN,
      dryRun:
        creds?.dryRun ??
        String(
          process.env.X_DRY_RUN ??
            process.env.ONECLAW_X_DRY_RUN ??
            "",
        ).toLowerCase() === "true",
    };

    if (
      this.creds.appKey &&
      this.creds.appSecret &&
      this.creds.accessToken &&
      this.creds.accessSecret
    ) {
      this.oauth = new OAuth({
        consumer: {
          key: this.creds.appKey,
          secret: this.creds.appSecret,
        },
        signature_method: "HMAC-SHA1",
        hash_function(baseString: string, key: string) {
          return crypto
            .createHmac("sha1", key)
            .update(baseString)
            .digest("base64");
        },
      });
    }
  }

  // =========================================================
  // Write auth (OAuth 1.0a)
  // =========================================================

  private getWriteAuth() {
    if (!this.oauth || !this.creds.accessToken || !this.creds.accessSecret) {
      throw new Error("X write credentials are not fully configured");
    }

    return {
      oauth: this.oauth,
      token: {
        key: this.creds.accessToken,
        secret: this.creds.accessSecret,
      },
    };
  }

  private async signedFetch(
    url: string,
    init: {
      method: "GET" | "POST";
      headers?: Record<string, string>;
      body?: BodyInit | null;
      data?: Record<string, unknown>;
    },
  ): Promise<Response> {
    const { oauth, token } = this.getWriteAuth();

    const requestData = init.data
      ? { url, method: init.method, data: init.data }
      : { url, method: init.method };

    const auth = oauth.authorize(requestData, token);

    return fetch(url, {
      method: init.method,
      headers: {
        ...oauth.toHeader(auth),
        ...(init.headers ?? {}),
      },
      body: init.body ?? null,
    });
  }

  // =========================================================
  // Read auth (Bearer)
  // =========================================================

  private getReadAuthHeader(): Record<string, string> {
    const bearer = asTrimmed(this.creds.bearerToken);
    if (!bearer) {
      throw new Error("X bearer token is not configured");
    }

    return {
      Authorization: `Bearer ${bearer}`,
    };
  }

  private async bearerFetch(
    url: string,
    init?: {
      method?: "GET";
      headers?: Record<string, string>;
    },
  ): Promise<Response> {
    const authHeaders = this.getReadAuthHeader();

    return fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
  }

  private async parseJsonOrThrow<T>(response: Response, label: string): Promise<T> {
    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`${label} failed: ${response.status} ${bodyText}`);
    }

    return (await response.json()) as T;
  }

  // =========================================================
  // Write methods
  // =========================================================

  async uploadMedia(mediaPath: string): Promise<string> {
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

    const buffer = fs.readFileSync(normalizedPath);
    const mimeType = mime.lookup(normalizedPath) || "application/octet-stream";
    const fileName = path.basename(normalizedPath);

    const url = "https://upload.twitter.com/1.1/media/upload.json";
    const form = new FormData();
    form.append(
      "media",
      new Blob([buffer], { type: String(mimeType) }),
      fileName,
    );

    const response = await this.signedFetch(url, {
      method: "POST",
      body: form,
    });

    const payload = await this.parseJsonOrThrow<{ media_id_string?: string }>(
      response,
      "X media upload",
    );

    if (!payload.media_id_string) {
      throw new Error("X media upload missing media_id_string");
    }

    return payload.media_id_string;
  }

  async createPost(params: XCreatePostParams): Promise<unknown> {
    const text = asTrimmed(params.text);
    if (!text) {
      throw new Error("Post text is required");
    }

    const replyToTweetId = asTrimmed(params.replyToTweetId);
    const mediaPaths =
      params.mediaPaths
        ?.map((item) => asTrimmed(item))
        .filter((item) => item.length > 0) ?? [];

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

    if (replyToTweetId && !isNumericId(replyToTweetId)) {
      throw new Error(
        "Invalid replyToTweetId: must be a numeric tweet ID (1-19 digits)",
      );
    }

    const mediaIds = mediaPaths.length
      ? await Promise.all(mediaPaths.map((item) => this.uploadMedia(item)))
      : [];

    const body: Record<string, unknown> = {
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

  async tweet(text: string): Promise<unknown> {
    return this.createPost({ text });
  }

  async reply(text: string, replyToTweetId: string): Promise<unknown> {
    return this.createPost({ text, replyToTweetId });
  }

  // =========================================================
  // Read mapping helpers
  // =========================================================

  private mapTweet(raw: any): XTweet {
    return {
      id: asTrimmed(raw?.id),
      text: asTrimmed(raw?.text),
      authorId: asTrimmed(raw?.author_id) || undefined,
      createdAt: asTrimmed(raw?.created_at) || undefined,
      conversationId: asTrimmed(raw?.conversation_id) || undefined,
      referencedTweets: Array.isArray(raw?.referenced_tweets)
        ? raw.referenced_tweets
            .map((item: any) => ({
              type: asTrimmed(item?.type),
              id: asTrimmed(item?.id),
            }))
            .filter((item: XTweetReference) => item.type && item.id)
        : undefined,
    };
  }

  private mapUser(raw: any): XUser {
    return {
      id: asTrimmed(raw?.id),
      username: asTrimmed(raw?.username),
      name: asTrimmed(raw?.name) || undefined,
    };
  }

  // =========================================================
  // Read methods
  // =========================================================

  async getTweet(tweetId: string): Promise<XTweet | null> {
    const id = asTrimmed(tweetId);
    if (!isNumericId(id)) {
      throw new Error("tweetId must be a numeric tweet ID");
    }

    const query = toQueryString({
      "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
    });

    const url = `https://api.twitter.com/2/tweets/${id}${query}`;
    const response = await this.bearerFetch(url);

    const payload = await this.parseJsonOrThrow<{ data?: any }>(
      response,
      "X getTweet",
    );

    if (!payload.data) return null;
    return this.mapTweet(payload.data);
  }

  async getTweets(tweetIds: string[]): Promise<XTweet[]> {
    const ids = tweetIds
      .map((item) => asTrimmed(item))
      .filter((item) => isNumericId(item));

    if (!ids.length) return [];

    const query = toQueryString({
      ids: ids.join(","),
      "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
    });

    const url = `https://api.twitter.com/2/tweets${query}`;
    const response = await this.bearerFetch(url);

    const payload = await this.parseJsonOrThrow<{ data?: any[] }>(
      response,
      "X getTweets",
    );

    return Array.isArray(payload.data)
      ? payload.data.map((item) => this.mapTweet(item))
      : [];
  }

  async getUserByUsername(username: string): Promise<XUser | null> {
    const normalized = asTrimmed(username).replace(/^@/, "");
    if (!normalized) {
      throw new Error("username is required");
    }

    const query = toQueryString({
      "user.fields": "name,username",
    });

    const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(
      normalized,
    )}${query}`;

    const response = await this.bearerFetch(url);

    const payload = await this.parseJsonOrThrow<{ data?: any }>(
      response,
      "X getUserByUsername",
    );

    if (!payload.data) return null;
    return this.mapUser(payload.data);
  }

  async getUserTweets(
    userId: string,
    options?: {
      maxResults?: number;
      paginationToken?: string;
    },
  ): Promise<XUserTweetsResponse> {
    const id = asTrimmed(userId);
    if (!isNumericId(id)) {
      throw new Error("userId must be a numeric user ID");
    }

    const maxResults = Math.max(
      5,
      Math.min(100, Number(options?.maxResults ?? 10)),
    );

    const query = toQueryString({
      max_results: maxResults,
      pagination_token: asTrimmed(options?.paginationToken) || undefined,
      "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
    });

    const url = `https://api.twitter.com/2/users/${id}/tweets${query}`;
    const response = await this.bearerFetch(url);

    const payload = await this.parseJsonOrThrow<{
      data?: any[];
      meta?: { next_token?: string };
    }>(response, "X getUserTweets");

    return {
      user: null,
      tweets: Array.isArray(payload.data)
        ? payload.data.map((item) => this.mapTweet(item))
        : [],
      nextToken: asTrimmed(payload.meta?.next_token) || undefined,
    };
  }

  async getUserTweetsByUsername(
    username: string,
    options?: {
      maxResults?: number;
      paginationToken?: string;
    },
  ): Promise<XUserTweetsResponse> {
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

  async searchRecentTweets(
    query: string,
    options?: {
      maxResults?: number;
      paginationToken?: string;
    },
  ): Promise<XSearchResponse> {
    const normalizedQuery = asTrimmed(query);
    if (!normalizedQuery) {
      throw new Error("search query is required");
    }

    const maxResults = Math.max(
      10,
      Math.min(100, Number(options?.maxResults ?? 10)),
    );

    const queryString = toQueryString({
      query: normalizedQuery,
      max_results: maxResults,
      next_token: asTrimmed(options?.paginationToken) || undefined,
      "tweet.fields": "author_id,created_at,conversation_id,referenced_tweets",
    });

    const url = `https://api.twitter.com/2/tweets/search/recent${queryString}`;
    const response = await this.bearerFetch(url);

    const payload = await this.parseJsonOrThrow<{
      data?: any[];
      meta?: { next_token?: string };
    }>(response, "X searchRecentTweets");

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

  isConfigured(): boolean {
    return Boolean(
      this.creds.appKey &&
        this.creds.appSecret &&
        this.creds.accessToken &&
        this.creds.accessSecret,
    );
  }

  isReadConfigured(): boolean {
    return Boolean(this.creds.bearerToken);
  }

  isDryRun(): boolean {
    return Boolean(this.creds.dryRun);
  }
}