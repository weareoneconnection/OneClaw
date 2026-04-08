import { XAdapter, type XTweet } from "../../adapters/x/x-adapter.js";
import type { CandidateTweet } from "./types.js";

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isRootTweet(tweet: XTweet): boolean {
  const tweetId = asString(tweet.id);
  const conversationId = asString(tweet.conversationId);
  return Boolean(tweetId) && Boolean(conversationId) && tweetId === conversationId;
}

function isReplyTweet(tweet: XTweet): boolean {
  return Boolean(
    tweet.referencedTweets?.some((item) => item?.type === "replied_to"),
  );
}

function hasRestrictedShape(tweet: XTweet, selfUsername: string, selfUserId: string): boolean {
  const text = normalizeWhitespace(asString(tweet.text));
  const lowered = text.toLowerCase();

  if (!tweet.id || !text) return true;
  if (text.length < 35) return true;

  if (asString(tweet.authorId) === selfUserId) return true;
  if (selfUsername && lowered.includes(`@${selfUsername.toLowerCase()}`)) return true;

  if (!isRootTweet(tweet)) return true;
  if (isReplyTweet(tweet)) return true;

  if (lowered.startsWith("rt ")) return true;
  if (lowered.startsWith("rt @")) return true;

  if (
    lowered.includes("giveaway") ||
    lowered.includes("follow me") ||
    lowered.includes("dm me") ||
    lowered.includes("airdrop") ||
    lowered.includes("whitelist") ||
    lowered.includes("pump") ||
    lowered.includes("100x") ||
    lowered.includes("join our telegram") ||
    lowered.includes("link in bio")
  ) {
    return true;
  }

  return false;
}

function hasStrongOpenReplySignal(tweet: XTweet): boolean {
  const text = normalizeWhitespace(asString(tweet.text));
  const lowered = text.toLowerCase();

  if (
    lowered.includes("what do you think") ||
    lowered.includes("how do you think") ||
    lowered.includes("share your") ||
    lowered.includes("drop below") ||
    lowered.includes("reply below") ||
    lowered.includes("comment below") ||
    lowered.includes("builders") ||
    lowered.includes("thread") ||
    lowered.includes("thoughts?") ||
    lowered.includes("agree?") ||
    lowered.includes("disagree?")
  ) {
    return true;
  }

  if (text.includes("?")) return true;

  return false;
}

function looksLikeLockedAnnouncement(tweet: XTweet): boolean {
  const lowered = normalizeWhitespace(asString(tweet.text)).toLowerCase();

  return (
    lowered.includes("introducing") ||
    lowered.includes("we are launching") ||
    lowered.includes("our product") ||
    lowered.includes("we're rolling out") ||
    lowered.includes("it’s our honor to present") ||
    lowered.includes("officially launching") ||
    lowered.includes("now live")
  );
}

function isHighProbabilityReplyTarget(
  tweet: XTweet,
  selfUsername: string,
  selfUserId: string,
): boolean {
  if (hasRestrictedShape(tweet, selfUsername, selfUserId)) return false;
  if (looksLikeLockedAnnouncement(tweet)) return false;
  if (!hasStrongOpenReplySignal(tweet)) return false;
  return true;
}

function toCandidate(tweet: XTweet): CandidateTweet {
  return {
    tweetId: asString(tweet.id),
    text: normalizeWhitespace(asString(tweet.text)),
    createdAt: asString(tweet.createdAt) || undefined,
    authorId: asString(tweet.authorId) || undefined,
    conversationId: asString(tweet.conversationId) || undefined,
    referencedTweets: tweet.referencedTweets?.length
      ? tweet.referencedTweets.map((item) => ({
          type: asString(item.type),
          id: asString(item.id),
        }))
      : undefined,
  } as CandidateTweet;
}

export async function fetchGrowthCandidates(
  x: XAdapter,
): Promise<CandidateTweet[]> {
  const queries = [
    '"AI agents" workflow OR "what do you think"',
    '"AI automation" builders OR "share your"',
    '"agent infrastructure" thread',
    '"execution layer" AI question',
    '"automation" founders thread',
  ];

  const selfUserId = asString(process.env.X_SELF_USER_ID);
  const selfUsername = asString(process.env.X_SELF_USERNAME).replace(/^@/, "");

  const seenTweetIds = new Set<string>();
  const seenTextFingerprints = new Set<string>();
  const out: CandidateTweet[] = [];

  for (const query of queries) {
    let result;
    try {
      result = await x.searchRecentTweets(query, { maxResults: 10 });
    } catch (error) {
      console.error(`[x-growth] candidate query failed: ${query}`, error);
      continue;
    }

    for (const tweet of result.tweets) {
      if (!isHighProbabilityReplyTarget(tweet, selfUsername, selfUserId)) {
        continue;
      }

      const id = asString(tweet.id);
      if (!id || seenTweetIds.has(id)) continue;

      const candidate = toCandidate(tweet);
      const fingerprint = normalizeWhitespace(candidate.text).toLowerCase();

      if (!fingerprint || seenTextFingerprints.has(fingerprint)) continue;

      seenTweetIds.add(id);
      seenTextFingerprints.add(fingerprint);
      out.push(candidate);

      if (out.length >= 10) {
        return out;
      }
    }
  }

  return out;
}