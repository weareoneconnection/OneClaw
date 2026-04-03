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
export declare class XAdapter {
    private readonly oauth?;
    private readonly creds;
    constructor(creds?: XAdapterCreds);
    private getAuth;
    private signedFetch;
    uploadMedia(mediaPath: string): Promise<string>;
    createPost(params: XCreatePostParams): Promise<unknown>;
    tweet(text: string): Promise<unknown>;
    reply(text: string, replyToTweetId: string): Promise<unknown>;
    isConfigured(): boolean;
    isDryRun(): boolean;
}
export {};
