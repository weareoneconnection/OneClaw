function asString(value) {
    return String(value ?? "").trim();
}
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
}
function isLikelyUsefulTweet(tweet) {
    const text = normalizeWhitespace(asString(tweet.text));
    if (!tweet.id || !text)
        return false;
    if (text.length < 20)
        return false;
    const lowered = text.toLowerCase();
    if (lowered.startsWith("rt "))
        return false;
    if (lowered.startsWith("rt @"))
        return false;
    if (lowered.includes("giveaway") ||
        lowered.includes("follow me") ||
        lowered.includes("dm me") ||
        lowered.includes("airdrop") ||
        lowered.includes("whitelist") ||
        lowered.includes("pump") ||
        lowered.includes("100x")) {
        return false;
    }
    return true;
}
function toCandidate(tweet) {
    return {
        tweetId: asString(tweet.id),
        text: normalizeWhitespace(asString(tweet.text)),
        createdAt: asString(tweet.createdAt) || undefined,
    };
}
export async function fetchGrowthCandidates(x) {
    const queries = [
        '"AI agents" execution',
        '"AI automation" workflow',
        '"execution layer" AI',
        '"agent infrastructure"',
        '"AI operator"',
    ];
    const seenTweetIds = new Set();
    const seenTextFingerprints = new Set();
    const out = [];
    for (const query of queries) {
        let result;
        try {
            result = await x.searchRecentTweets(query, { maxResults: 8 });
        }
        catch (error) {
            console.error(`[x-growth] candidate query failed: ${query}`, error);
            continue;
        }
        for (const tweet of result.tweets) {
            if (!isLikelyUsefulTweet(tweet))
                continue;
            const id = asString(tweet.id);
            if (!id || seenTweetIds.has(id))
                continue;
            const candidate = toCandidate(tweet);
            const fingerprint = normalizeWhitespace(candidate.text).toLowerCase();
            if (seenTextFingerprints.has(fingerprint))
                continue;
            seenTweetIds.add(id);
            seenTextFingerprints.add(fingerprint);
            out.push(candidate);
            if (out.length >= 12) {
                return out;
            }
        }
    }
    return out;
}
