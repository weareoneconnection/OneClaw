import path from "node:path";
import { XAdapter } from "../../adapters/x/x-adapter.js";
import { executeOneClawTask, } from "../../clients/oneclawClient.js";
import { runOneAIWorkflow } from "./oneaiClient.js";
import { XGrowthStateStore } from "./state.js";
import { canRunEngage, canRunPublisher, defaultXGuardConfig } from "./guard.js";
import { fetchGrowthCandidates } from "./candidates.js";
import { extractOneClawTask } from "./extract.js";
function randomJitterMs(maxMs) {
    return Math.floor(Math.random() * Math.max(0, maxMs));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function nowIso() {
    return new Date().toISOString();
}
function asString(value) {
    return String(value ?? "").trim();
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function normalizeTweetId(value) {
    return String(value ?? "").trim();
}
function isLikelyTweetId(value) {
    const id = normalizeTweetId(value);
    return /^[0-9]{5,30}$/.test(id);
}
export class XGrowthRunner {
    xAdapter;
    stateStore;
    constructor() {
        this.xAdapter = new XAdapter({
            appKey: process.env.X_APP_KEY,
            appSecret: process.env.X_APP_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_SECRET,
            bearerToken: process.env.X_BEARER_TOKEN,
            dryRun: String(process.env.ONECLAW_X_DRY_RUN ?? "").toLowerCase() === "true",
        });
        const statePath = process.env.X_GROWTH_STATE_PATH ??
            path.resolve("./artifacts/x-growth-state.json");
        console.log("[x-growth] statePath =", statePath);
        this.stateStore = new XGrowthStateStore(statePath);
    }
    getSelfUsername() {
        return asString(process.env.X_SELF_USERNAME)
            .replace(/^@/, "")
            .toLowerCase();
    }
    getSelfUserId() {
        return asString(process.env.X_SELF_USER_ID);
    }
    isSelfCandidate(tweet) {
        const selfUserId = this.getSelfUserId();
        const selfUsername = this.getSelfUsername();
        const authorId = asString(tweet.authorId);
        const username = asString(tweet.username).replace(/^@/, "").toLowerCase();
        if (selfUserId && authorId && selfUserId === authorId) {
            return true;
        }
        if (selfUsername && username && selfUsername === username) {
            return true;
        }
        return false;
    }
    isReplyStep(step) {
        const input = step.input ?? {};
        return Boolean(asString(input.replyToTweetId));
    }
    isPostStep(step) {
        return !this.isReplyStep(step);
    }
    toExecutableStep(step, fallbackId) {
        const action = asString(step.action);
        const input = step.input ?? {};
        if (!action)
            return null;
        if (!Object.keys(input).length)
            return null;
        return {
            id: asString(step.id) || fallbackId,
            action: action,
            input,
            dependsOn: Array.isArray(step.dependsOn)
                ? step.dependsOn.filter((item) => asString(item).length > 0)
                : undefined,
        };
    }
    toExecutableSteps(steps, prefix) {
        return steps
            .map((step, index) => this.toExecutableStep(step, `${prefix}-${index + 1}`))
            .filter((step) => Boolean(step));
    }
    validatePublisherStep(step) {
        const input = step.input ?? {};
        const content = asString(input.content);
        const replyToTweetId = asString(input.replyToTweetId);
        if (!content) {
            return { ok: false, reason: "missing content" };
        }
        if (replyToTweetId) {
            return {
                ok: false,
                reason: "publisher step unexpectedly contains replyToTweetId",
            };
        }
        return { ok: true };
    }
    validateEngageStep(step, state, allowedTweetIds) {
        const input = step.input ?? {};
        const content = asString(input.content);
        const replyToTweetId = normalizeTweetId(input.replyToTweetId);
        if (!content) {
            return { ok: false, reason: "missing content" };
        }
        if (!replyToTweetId) {
            return { ok: false, reason: "missing replyToTweetId" };
        }
        if (!isLikelyTweetId(replyToTweetId)) {
            return {
                ok: false,
                reason: `invalid replyToTweetId: ${replyToTweetId}`,
            };
        }
        if (!allowedTweetIds.has(replyToTweetId)) {
            return {
                ok: false,
                reason: `reply target not in fresh candidate set: ${replyToTweetId}`,
            };
        }
        if (state.seenReplyTweetIds.includes(replyToTweetId)) {
            return {
                ok: false,
                reason: `already replied to tweet: ${replyToTweetId}`,
            };
        }
        if (state.blockedReplyTweetIds.includes(replyToTweetId)) {
            return {
                ok: false,
                reason: `reply target is blocked due to prior restriction: ${replyToTweetId}`,
            };
        }
        const hash = this.stateStore.hashContent(content);
        if (state.seenContentHashes.includes(hash)) {
            return { ok: false, reason: "duplicate reply content hash" };
        }
        return { ok: true };
    }
    logStepSummary(prefix, steps) {
        console.log(`${prefix} steps=`, JSON.stringify(steps.map((step) => ({
            id: step.id,
            action: step.action,
            content: asString(step.input?.content),
            replyToTweetId: asString(step.input?.replyToTweetId),
            strictReply: step.input?.strictReply,
            mode: asString(step.input?.mode),
        })), null, 2));
    }
    collectRestrictedReplyTargets(result) {
        const blocked = new Set();
        const envelope = (result ?? {});
        const toOutputRecord = (item) => {
            if (!item || typeof item !== "object")
                return {};
            const maybeOutput = "output" in item && item.output && typeof item.output === "object"
                ? item.output
                : item;
            return maybeOutput && typeof maybeOutput === "object"
                ? maybeOutput
                : {};
        };
        const scanItem = (item) => {
            const output = toOutputRecord(item);
            const errorCode = asString(output["errorCode"]);
            const replyToTweetId = normalizeTweetId(output["replyToTweetId"]);
            const shouldBlockReplyTarget = Boolean(output["shouldBlockReplyTarget"]);
            if (errorCode === "X_REPLY_RESTRICTED" &&
                shouldBlockReplyTarget &&
                replyToTweetId) {
                blocked.add(replyToTweetId);
            }
        };
        scanItem(envelope.output);
        for (const item of asArray(envelope.results)) {
            scanItem(item);
        }
        return Array.from(blocked);
    }
    async runPublisher() {
        const state = this.stateStore.load();
        const gate = canRunPublisher(state, defaultXGuardConfig);
        if (!gate.ok) {
            console.log(`[x-growth] skip publisher: ${gate.reason}`);
            return;
        }
        await sleep(randomJitterMs(3 * 60 * 1000));
        const workflowResult = await runOneAIWorkflow({
            task: "x_publisher",
            input: {
                message: "Publish a real high-signal post for the official OneAI account now. Prefer shouldExecute=true for growth, proof, or launch if a credible post can be produced. Do not choose quiet unless the input is unusable.",
                lang: "en",
                websiteUrl: process.env.ONEAI_WEBSITE_URL ?? "https://oneai.network",
                postureHint: "growth",
            },
        });
        console.log("[x-growth] publisher workflowResult=", JSON.stringify(workflowResult, null, 2));
        const task = extractOneClawTask(workflowResult);
        if (!task) {
            console.log("[x-growth] publisher returned no executable task");
            return;
        }
        const rawSteps = asArray(task.steps);
        this.logStepSummary("[x-growth] publisher raw", rawSteps);
        const validRawSteps = rawSteps.filter((step) => {
            const result = this.validatePublisherStep(step);
            if (!result.ok) {
                console.log(`[x-growth] skip publisher step: ${result.reason}`);
                return false;
            }
            return true;
        });
        const executableSteps = this.toExecutableSteps(validRawSteps, "publisher");
        if (!executableSteps.length) {
            console.log("[x-growth] publisher task contains no executable steps");
            return;
        }
        for (const step of executableSteps) {
            const content = asString(step.input?.content);
            const hash = this.stateStore.hashContent(content);
            if (state.seenContentHashes.includes(hash)) {
                console.log("[x-growth] skip duplicate publisher content hash");
                return;
            }
        }
        const taskResult = (await executeOneClawTask({
            taskName: task.taskName,
            approvalMode: "auto",
            steps: executableSteps,
        }));
        const newState = this.stateStore.load();
        newState.lastPublisherRunAt = nowIso();
        if (!taskResult || taskResult.ok === false) {
            console.warn("[x-growth] publisher execution failed");
            this.stateStore.recordFailure(newState);
            this.stateStore.save(newState);
            return;
        }
        let newPostCount = 0;
        for (const step of executableSteps) {
            const content = asString(step.input?.content);
            newPostCount += 1;
            if (content) {
                const hash = this.stateStore.hashContent(content);
                this.stateStore.addSeenContentHash(newState, hash);
            }
        }
        newState.dailyPostCount += newPostCount;
        this.stateStore.resetFailure(newState);
        this.stateStore.save(newState);
    }
    async runEngage() {
        const state = this.stateStore.load();
        if (this.stateStore.shouldPauseEngage(state)) {
            console.warn("[x-growth] engage paused due to failure streak =", state.failureStreak);
            return;
        }
        const gate = canRunEngage(state, defaultXGuardConfig);
        if (!gate.ok) {
            console.log(`[x-growth] skip engage: ${gate.reason}`);
            return;
        }
        if (!this.xAdapter.isReadConfigured()) {
            console.log("[x-growth] skip engage: X_BEARER_TOKEN not configured");
            return;
        }
        await sleep(randomJitterMs(5 * 60 * 1000));
        const candidateTweets = asArray(await fetchGrowthCandidates(this.xAdapter));
        const filteredCandidates = candidateTweets.filter((tweet) => {
            const tweetId = normalizeTweetId(tweet.tweetId);
            if (!tweetId)
                return false;
            if (!isLikelyTweetId(tweetId))
                return false;
            if (this.stateStore.isBlocked(state, tweetId))
                return false;
            if (state.seenReplyTweetIds.includes(tweetId))
                return false;
            if (this.isSelfCandidate(tweet))
                return false;
            return true;
        });
        if (!filteredCandidates.length) {
            console.log("[x-growth] no fresh candidate tweets after filtering");
            return;
        }
        const allowedTweetIds = new Set(filteredCandidates.map((tweet) => normalizeTweetId(tweet.tweetId)));
        console.log("[x-growth] engage candidates=", JSON.stringify(filteredCandidates.map((tweet) => ({
            tweetId: tweet.tweetId,
            authorId: tweet.authorId ?? "",
            username: tweet.username ?? "",
            createdAt: tweet.createdAt ?? "",
            conversationId: tweet.conversationId ?? "",
            text: asString(tweet.text).slice(0, 180),
        })), null, 2));
        const workflowResult = await runOneAIWorkflow({
            task: "x_engage",
            input: {
                message: "Review these candidate tweets and reply only when: 1) the tweet is likely open to public replies, 2) the author appears to welcome discussion, and 3) the interaction creates real credibility, useful visibility, or builder-grade positioning for OneAI. IMPORTANT: output reply tasks only. Never output a standalone post. Avoid tweets that look like restricted brand announcements, gated conversations, or posts where replies may be limited to mentioned or already-engaged users.",
                lang: "en",
                candidateTweets: filteredCandidates,
            },
        });
        console.log("[x-growth] engage workflowResult=", JSON.stringify(workflowResult, null, 2));
        const task = extractOneClawTask(workflowResult);
        if (!task) {
            console.log("[x-growth] engage returned no executable task");
            return;
        }
        const rawSteps = asArray(task.steps);
        this.logStepSummary("[x-growth] engage raw", rawSteps);
        const mixedPostDetected = rawSteps.some((step) => this.isPostStep(step));
        if (mixedPostDetected) {
            console.warn("[x-growth] engage produced non-reply steps; they will be dropped");
        }
        const validRawSteps = rawSteps.filter((step) => {
            if (!this.isReplyStep(step)) {
                return false;
            }
            const result = this.validateEngageStep(step, state, allowedTweetIds);
            if (!result.ok) {
                console.log(`[x-growth] skip engage step: ${result.reason}`);
                return false;
            }
            return true;
        });
        const executableSteps = this.toExecutableSteps(validRawSteps.map((step) => ({
            ...step,
            input: {
                ...(step.input ?? {}),
                mode: "reply_only",
                strictReply: true,
            },
        })), "engage");
        if (!executableSteps.length) {
            console.log("[x-growth] engage task filtered to zero allowed reply steps");
            return;
        }
        console.log("[x-growth] engage approved reply targets=", JSON.stringify(executableSteps.map((step) => ({
            id: step.id,
            action: step.action,
            replyToTweetId: asString(step.input?.replyToTweetId),
            content: asString(step.input?.content),
            strictReply: step.input?.strictReply,
            mode: asString(step.input?.mode),
        })), null, 2));
        const taskResult = (await executeOneClawTask({
            taskName: task.taskName,
            approvalMode: "auto",
            steps: executableSteps,
        }));
        const newState = this.stateStore.load();
        newState.lastEngageRunAt = nowIso();
        if (!taskResult || taskResult.ok === false) {
            console.warn("[x-growth] engage execution failed");
            this.stateStore.recordFailure(newState);
            this.stateStore.save(newState);
            return;
        }
        const restrictedReplyTargets = this.collectRestrictedReplyTargets(taskResult);
        if (restrictedReplyTargets.length) {
            for (const tweetId of restrictedReplyTargets) {
                this.stateStore.addBlockedReplyTweetId(newState, tweetId);
            }
            console.warn("[x-growth] blocked restricted reply targets=", JSON.stringify(restrictedReplyTargets, null, 2));
            this.stateStore.recordFailure(newState);
        }
        else {
            this.stateStore.resetFailure(newState);
        }
        let successfulReplyCount = 0;
        for (const step of executableSteps) {
            const replyToTweetId = asString(step.input?.replyToTweetId);
            const content = asString(step.input?.content);
            if (replyToTweetId && !restrictedReplyTargets.includes(replyToTweetId)) {
                this.stateStore.addSeenReplyTweetId(newState, replyToTweetId);
                successfulReplyCount += 1;
            }
            if (content) {
                const hash = this.stateStore.hashContent(content);
                this.stateStore.addSeenContentHash(newState, hash);
            }
        }
        newState.dailyReplyCount += successfulReplyCount;
        this.stateStore.save(newState);
    }
    async runLoop() {
        try {
            await this.runPublisher();
        }
        catch (error) {
            console.error("[x-growth] publisher failed:", error);
            const state = this.stateStore.load();
            this.stateStore.recordFailure(state);
            this.stateStore.save(state);
        }
        try {
            await this.runEngage();
        }
        catch (error) {
            console.error("[x-growth] engage failed:", error);
            const state = this.stateStore.load();
            this.stateStore.recordFailure(state);
            this.stateStore.save(state);
        }
    }
}
