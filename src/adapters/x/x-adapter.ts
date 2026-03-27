import crypto from "node:crypto";
import fs from 'node:fs';
import path from 'node:path';
import OAuth from "oauth-1.0a";
import mime from 'mime-types';

export interface XCreatePostParams {
  text: string;
  replyToTweetId?: string;
  mediaPaths?: string[];
}

export class XAdapter {
  private readonly oauth?: OAuth;

  constructor(private readonly creds: {
    appKey?: string;
    appSecret?: string;
    accessToken?: string;
    accessSecret?: string;
    dryRun?: boolean;
  }) {
    if (creds.appKey && creds.appSecret && creds.accessToken && creds.accessSecret) {
      this.oauth = new OAuth({
        consumer: { key: creds.appKey, secret: creds.appSecret },
        signature_method: "HMAC-SHA1",
        hash_function(baseString, key) {
          return crypto.createHmac("sha1", key).update(baseString).digest("base64");
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
      token: { key: this.creds.accessToken, secret: this.creds.accessSecret },
    };
  }

  private async signedFetch(url: string, init: { method: 'GET'|'POST'; headers?: Record<string,string>; body?: BodyInit | null; data?: Record<string, unknown> }) {
    const { oauth, token } = this.getAuth();
    const requestData = { url, method: init.method, data: init.data };
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
    if (this.creds.dryRun) return `dryrun-${path.basename(mediaPath)}`;
    const buffer = fs.readFileSync(mediaPath);
    const mimeType = mime.lookup(mediaPath) || 'application/octet-stream';
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const form = new FormData();
    form.append('media', new Blob([buffer], { type: String(mimeType) }), path.basename(mediaPath));
    const response = await this.signedFetch(url, { method: 'POST', body: form });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`X media upload failed: ${response.status} ${body}`);
    }
    const payload = await response.json() as { media_id_string?: string };
    if (!payload.media_id_string) throw new Error('X media upload missing media_id_string');
    return payload.media_id_string;
  }

  async createPost(params: XCreatePostParams): Promise<unknown> {
    if (this.creds.dryRun) {
      return {
        data: {
          id: `dryrun-${Date.now()}`,
          text: params.text,
          media: params.mediaPaths ?? [],
          replyToTweetId: params.replyToTweetId ?? null,
        },
      };
    }
    const mediaIds = params.mediaPaths?.length
      ? await Promise.all(params.mediaPaths.map((item) => this.uploadMedia(item)))
      : [];

    const body: Record<string, unknown> = { text: params.text };
    if (params.replyToTweetId) body.reply = { in_reply_to_tweet_id: params.replyToTweetId };
    if (mediaIds.length) body.media = { media_ids: mediaIds };

    const url = "https://api.twitter.com/2/tweets";
    const response = await this.signedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      data: body,
    });
    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`X create post failed: ${response.status} ${bodyText}`);
    }
    return response.json();
  }
}
