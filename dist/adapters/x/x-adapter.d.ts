export interface XCreatePostParams {
    text: string;
    replyToTweetId?: string;
    mediaPaths?: string[];
}
export declare class XAdapter {
    private readonly creds;
    private readonly oauth?;
    constructor(creds: {
        appKey?: string;
        appSecret?: string;
        accessToken?: string;
        accessSecret?: string;
        dryRun?: boolean;
    });
    private getAuth;
    private signedFetch;
    uploadMedia(mediaPath: string): Promise<string>;
    createPost(params: XCreatePostParams): Promise<unknown>;
}
