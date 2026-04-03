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

type XAdapterCreds = {
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  dryRun?: boolean;
};

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

export class XAdapter {
  private readonly oauth?: OAuth;
  private readonly creds: XAdapterCreds;

  constructor(creds?: XAdapterCreds) {
    this.creds = {
      appKey: creds?.appKey ?? process.env.X_API_KEY,
      appSecret: creds?.appSecret ?? process.env.X_API_SECRET,
      accessToken: creds?.accessToken ?? process.env.X_ACCESS_TOKEN,
      accessSecret: creds?.accessSecret ?? process.env.X_ACCESS_SECRET,
      dryRun:
        creds?.dryRun ??
        String(process.env.X_DRY_RUN ?? "").toLowerCase() === "true",
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

  private getAuth() {
    if (!this.oauth || !this.creds.accessToken || !this.creds.accessSecret) {
      throw new Error("X credentials are not fully configured");
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
    const { oauth, token } = this.getAuth();

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

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(
        `X media upload failed: ${response.status} ${bodyText}`,
      );
    }

    const payload = (await response.json()) as {
      media_id_string?: string;
    };

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

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`X create post failed: ${response.status} ${bodyText}`);
    }

    return response.json();
  }

  async tweet(text: string): Promise<unknown> {
    return this.createPost({ text });
  }

  async reply(text: string, replyToTweetId: string): Promise<unknown> {
    return this.createPost({ text, replyToTweetId });
  }

  isConfigured(): boolean {
    return Boolean(
      this.creds.appKey &&
        this.creds.appSecret &&
        this.creds.accessToken &&
        this.creds.accessSecret,
    );
  }

  isDryRun(): boolean {
    return Boolean(this.creds.dryRun);
  }
}
