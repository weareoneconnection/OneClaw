export type CandidateTweet = {
  tweetId: string;
  author?: string;
  text: string;
  createdAt?: string;
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