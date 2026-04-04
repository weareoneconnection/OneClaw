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
export declare class XAdapter {
    private readonly oauth?;
    private readonly creds;
    private readonly requestTimeoutMs;
    private readonly maxMediaSizeBytes;
    private readonly maxPostLength;
    constructor(creds?: XAdapterCreds);
    private getWriteAuth;
    private signedFetch;
    private getReadAuthHeader;
    private bearerFetch;
    private fetchWithTimeout;
    private parseJsonOrThrow;
    uploadMedia(mediaPath: string): Promise<string>;
    createPost(params: XCreatePostParams): Promise<unknown>;
    tweet(text: string): Promise<unknown>;
    reply(text: string, replyToTweetId: string): Promise<unknown>;
    private mapTweet;
    private mapUser;
    getTweet(tweetId: string): Promise<XTweet | null>;
    getTweets(tweetIds: string[]): Promise<XTweet[]>;
    getUserByUsername(username: string): Promise<XUser | null>;
    getUserTweets(userId: string, options?: {
        maxResults?: number;
        paginationToken?: string;
    }): Promise<XUserTweetsResponse>;
    getUserTweetsByUsername(username: string, options?: {
        maxResults?: number;
        paginationToken?: string;
    }): Promise<XUserTweetsResponse>;
    searchRecentTweets(query: string, options?: {
        maxResults?: number;
        paginationToken?: string;
    }): Promise<XSearchResponse>;
    isConfigured(): boolean;
    isReadConfigured(): boolean;
    isDryRun(): boolean;
}
