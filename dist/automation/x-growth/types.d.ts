export type CandidateTweet = {
    tweetId: string;
    text: string;
    createdAt?: string;
    authorId?: string;
    username?: string;
    authorName?: string;
    authorVerified?: boolean;
    authorFollowersCount?: number;
    conversationId?: string;
    referencedTweets?: Array<{
        type?: string;
        id?: string;
    }>;
};
export type XSafetyState = {
    lastPublisherRunAt?: string;
    lastEngageRunAt?: string;
    dailyPostCount: number;
    dailyReplyCount: number;
    seenReplyTweetIds: string[];
    seenContentHashes: string[];
    failureStreak: number;
    lastResetDate: string;
};
