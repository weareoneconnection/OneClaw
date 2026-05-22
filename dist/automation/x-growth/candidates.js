function asString(value) {
    return String(value ?? "").trim();
}
function isCreditsDepletedError(error) {
    const text = error instanceof Error
        ? error.message.toLowerCase()
        : JSON.stringify(error ?? "").toLowerCase();
    return (text.includes("creditsdepleted") ||
        text.includes("does not have any credits") ||
        text.includes(" 402 "));
}
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
}
function isRootTweet(tweet) {
    const tweetId = asString(tweet.id);
    const conversationId = asString(tweet.conversationId);
    return Boolean(tweetId) && Boolean(conversationId) && tweetId === conversationId;
}
function isReplyTweet(tweet) {
    return Boolean(tweet.referencedTweets?.some((item) => item?.type === "replied_to"));
}
function hasRestrictedShape(tweet, selfUsername, selfUserId) {
    const text = normalizeWhitespace(asString(tweet.text));
    const lowered = text.toLowerCase();
    const username = asString(tweet.authorUsername).toLowerCase();
    const name = asString(tweet.authorName).toLowerCase();
    const followers = Number(tweet.authorFollowersCount ?? 0);
    if (!tweet.id || !text)
        return true;
    if (text.length < 45)
        return true;
    if (asString(tweet.authorId) === selfUserId)
        return true;
    if (selfUsername && username === selfUsername.toLowerCase())
        return true;
    if (selfUsername && lowered.includes(`@${selfUsername.toLowerCase()}`))
        return true;
    if (!isRootTweet(tweet))
        return true;
    if (isReplyTweet(tweet))
        return true;
    if (lowered.startsWith("rt "))
        return true;
    if (lowered.startsWith("rt @"))
        return true;
    if (tweet.authorVerified)
        return true;
    if (followers > 50000)
        return true;
    if (username.includes("news") ||
        username.includes("official") ||
        username.includes("hq") ||
        username.includes("labs") ||
        name.includes("official") ||
        name.includes("news") ||
        name.includes("protocol") ||
        name.includes("foundation")) {
        return true;
    }
    if (lowered.includes("giveaway") ||
        lowered.includes("follow me") ||
        lowered.includes("dm me") ||
        lowered.includes("airdrop") ||
        lowered.includes("whitelist") ||
        lowered.includes("pump") ||
        lowered.includes("100x") ||
        lowered.includes("join our telegram") ||
        lowered.includes("link in bio")) {
        return true;
    }
    return false;
}
function hasStrongOpenReplySignal(tweet) {
    const text = normalizeWhitespace(asString(tweet.text));
    const lowered = text.toLowerCase();
    if (lowered.includes("what do you think") ||
        lowered.includes("how do you think") ||
        lowered.includes("what are your thoughts") ||
        lowered.includes("share your") ||
        lowered.includes("share your take") ||
        lowered.includes("curious what") ||
        lowered.includes("looking for feedback") ||
        lowered.includes("would love feedback") ||
        lowered.includes("drop below") ||
        lowered.includes("reply below") ||
        lowered.includes("comment below") ||
        lowered.includes("thoughts?") ||
        lowered.includes("agree?") ||
        lowered.includes("disagree?")) {
        return true;
    }
    return false;
}
function looksLikeLockedAnnouncement(tweet) {
    const lowered = normalizeWhitespace(asString(tweet.text)).toLowerCase();
    return (lowered.includes("introducing") ||
        lowered.includes("we are launching") ||
        lowered.includes("our product") ||
        lowered.includes("we're rolling out") ||
        lowered.includes("it’s our honor to present") ||
        lowered.includes("officially launching") ||
        lowered.includes("now live"));
}
function isHighProbabilityReplyTarget(tweet, selfUsername, selfUserId) {
    if (hasRestrictedShape(tweet, selfUsername, selfUserId))
        return false;
    if (looksLikeLockedAnnouncement(tweet))
        return false;
    if (!hasStrongOpenReplySignal(tweet))
        return false;
    return true;
}
function toCandidate(tweet) {
    return {
        tweetId: asString(tweet.id),
        text: normalizeWhitespace(asString(tweet.text)),
        createdAt: asString(tweet.createdAt) || undefined,
        authorId: asString(tweet.authorId) || undefined,
        username: asString(tweet.authorUsername) || undefined,
        authorName: asString(tweet.authorName) || undefined,
        authorVerified: tweet.authorVerified,
        authorFollowersCount: tweet.authorFollowersCount,
        conversationId: asString(tweet.conversationId) || undefined,
        referencedTweets: tweet.referencedTweets?.length
            ? tweet.referencedTweets.map((item) => ({
                type: asString(item.type),
                id: asString(item.id),
            }))
            : undefined,
    };
}
export async function fetchGrowthCandidates(x) {
    const queries = [
        '("AI agents" OR "AI automation") ("what do you think" OR thoughts)',
        '("agent workflow" OR "AI workflow") ("share your take" OR "looking for feedback")',
        '("AI agents" OR "automation") ("reply below" OR "comment below")',
        '("agent infrastructure" OR "execution layer") ("curious what" OR thoughts)',
        '("AI builders" OR founders) ("what are your thoughts" OR "would love feedback")',
    ];
    const selfUserId = asString(process.env.X_SELF_USER_ID);
    const selfUsername = asString(process.env.X_SELF_USERNAME).replace(/^@/, "");
    const seenTweetIds = new Set();
    const seenTextFingerprints = new Set();
    const out = [];
    for (const query of queries) {
        let result;
        try {
            result = await x.searchRecentTweets(query, { maxResults: 10 });
        }
        catch (error) {
            console.error(`[x-growth] candidate query failed: ${query}`, error);
            if (isCreditsDepletedError(error)) {
                throw error;
            }
            continue;
        }
        for (const tweet of result.tweets) {
            if (!isHighProbabilityReplyTarget(tweet, selfUsername, selfUserId)) {
                continue;
            }
            const id = asString(tweet.id);
            if (!id || seenTweetIds.has(id))
                continue;
            const candidate = toCandidate(tweet);
            const fingerprint = normalizeWhitespace(candidate.text).toLowerCase();
            if (!fingerprint || seenTextFingerprints.has(fingerprint))
                continue;
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
