import path from "node:path";
import { XAdapter } from "../../adapters/x/x-adapter.js";
import {
  executeOneClawTask,
  type OneClawAction,
  type OneClawTaskRequest,
} from "../../clients/oneclawClient.js";
import { runOneAIWorkflow } from "./oneaiClient.js";
import { XGrowthStateStore } from "./state.js";
import { canRunEngage, canRunPublisher, defaultXGuardConfig } from "./guard.js";
import { fetchGrowthCandidates } from "./candidates.js";
import { extractOneClawTask } from "./extract.js";

function randomJitterMs(maxMs: number): number {
  return Math.floor(Math.random() * Math.max(0, maxMs));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTweetId(value: unknown): string {
  return String(value ?? "").trim();
}

function isLikelyTweetId(value: unknown): boolean {
  const id = normalizeTweetId(value);
  return /^[0-9]{5,30}$/.test(id);
}

type GrowthStep = {
  id?: string;
  action?: string;
  input?: Record<string, unknown>;
  dependsOn?: string[];
};

type ExecutableStep = OneClawTaskRequest["steps"][number];

type GrowthCandidate = {
  tweetId: string;
  authorId?: string;
  username?: string;
  text?: string;
  createdAt?: string;
  conversationId?: string;
  referencedTweets?: Array<{
    type?: string;
    id?: string;
  }>;
};

type TaskExecutionResult = {
  ok?: boolean;
  error?: string;
  output?: Record<string, unknown>;
};

type TaskExecutionEnvelope = {
  ok?: boolean;
  results?: TaskExecutionResult[];
  output?: Record<string, unknown>;
  error?: string;
};

export class XGrowthRunner {
  private readonly xAdapter: XAdapter;
  private readonly stateStore: XGrowthStateStore;

  constructor() {
    this.xAdapter = new XAdapter({
      appKey: process.env.X_APP_KEY,
      appSecret: process.env.X_APP_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
      bearerToken: process.env.X_BEARER_TOKEN,
      dryRun:
        String(process.env.ONECLAW_X_DRY_RUN ?? "").toLowerCase() === "true",
    });

    const statePath =
      process.env.X_GROWTH_STATE_PATH ??
      path.resolve("./artifacts/x-growth-state.json");

    this.stateStore = new XGrowthStateStore(statePath);
  }

  private getSelfUsername(): string {
    return asString(process.env.X_SELF_USERNAME).replace(/^@/, "").toLowerCase();
  }

  private getSelfUserId(): string {
    return asString(process.env.X_SELF_USER_ID);
  }

  private isSelfCandidate(tweet: GrowthCandidate): boolean {
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

  private isReplyStep(step: GrowthStep): boolean {
    const input = step.input ?? {};
    return Boolean(asString(input.replyToTweetId));
  }

  private isPostStep(step: GrowthStep): boolean {
    return !this.isReplyStep(step);
  }

  private toExecutableStep(
    step: GrowthStep,
    fallbackId: string,
  ): ExecutableStep | null {
    const action = asString(step.action);
    const input = step.input ?? {};

    if (!action) return null;
    if (!Object.keys(input).length) return null;

    return {
      id: asString(step.id) || fallbackId,
      action: action as OneClawAction,
      input,
      dependsOn: Array.isArray(step.dependsOn)
        ? step.dependsOn.filter((item) => asString(item).length > 0)
        : undefined,
    };
  }

  private toExecutableSteps(
    steps: GrowthStep[],
    prefix: string,
  ): ExecutableStep[] {
    return steps
      .map((step, index) => this.toExecutableStep(step, `${prefix}-${index + 1}`))
      .filter((step): step is ExecutableStep => Boolean(step));
  }

  private validatePublisherStep(
    step: GrowthStep,
  ): { ok: boolean; reason?: string } {
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

  private validateEngageStep(
    step: GrowthStep,
    state: ReturnType<XGrowthStateStore["load"]>,
    allowedTweetIds: Set<string>,
  ): { ok: boolean; reason?: string } {
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

  private logStepSummary(prefix: string, steps: GrowthStep[]): void {
    console.log(
      `${prefix} steps=`,
      JSON.stringify(
        steps.map((step) => ({
          id: step.id,
          action: step.action,
          content: asString(step.input?.content),
          replyToTweetId: asString(step.input?.replyToTweetId),
          strictReply: step.input?.strictReply,
          mode: asString(step.input?.mode),
        })),
        null,
        2,
      ),
    );
  }

  private collectRestrictedReplyTargets(result: unknown): string[] {
  const blocked = new Set<string>();
  const envelope = (result ?? {}) as TaskExecutionEnvelope;

  const toOutputRecord = (
    item: TaskExecutionResult | Record<string, unknown> | undefined,
  ): Record<string, unknown> => {
    if (!item || typeof item !== "object") return {};

    const maybeOutput =
      "output" in item && item.output && typeof item.output === "object"
        ? item.output
        : item;

    return maybeOutput && typeof maybeOutput === "object"
      ? (maybeOutput as Record<string, unknown>)
      : {};
  };

  const scanItem = (
    item: TaskExecutionResult | Record<string, unknown> | undefined,
  ) => {
    const output = toOutputRecord(item);

    const errorCode = asString(output["errorCode"]);
    const replyToTweetId = normalizeTweetId(output["replyToTweetId"]);
    const shouldBlockReplyTarget = Boolean(output["shouldBlockReplyTarget"]);

    if (
      errorCode === "X_REPLY_RESTRICTED" &&
      shouldBlockReplyTarget &&
      replyToTweetId
    ) {
      blocked.add(replyToTweetId);
    }
  };

  scanItem(envelope.output);

  for (const item of asArray(envelope.results)) {
    scanItem(item);
  }

  return Array.from(blocked);
}

  async runPublisher(): Promise<void> {
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
        message:
          "Publish a real high-signal post for the official OneAI account now. Prefer shouldExecute=true for growth, proof, or launch if a credible post can be produced. Do not choose quiet unless the input is unusable.",
        lang: "en",
        websiteUrl: process.env.ONEAI_WEBSITE_URL ?? "https://oneai.network",
        postureHint: "growth",
      },
    });

    console.log(
      "[x-growth] publisher workflowResult=",
      JSON.stringify(workflowResult, null, 2),
    );

    const task = extractOneClawTask(workflowResult);

    if (!task) {
      console.log("[x-growth] publisher returned no executable task");
      return;
    }

    const rawSteps = asArray<GrowthStep>(task.steps);
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

    await executeOneClawTask({
      taskName: task.taskName,
      approvalMode: "auto",
      steps: executableSteps,
    });

    const newState = this.stateStore.load();
    newState.lastPublisherRunAt = nowIso();

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
    newState.failureStreak = 0;

    this.stateStore.save(newState);
  }

  async runEngage(): Promise<void> {
    const state = this.stateStore.load();
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

    const candidateTweets = asArray<GrowthCandidate>(
      await fetchGrowthCandidates(this.xAdapter),
    );

    const filteredCandidates = candidateTweets.filter((tweet) => {
      const tweetId = normalizeTweetId(tweet.tweetId);

      if (!tweetId) return false;
      if (!isLikelyTweetId(tweetId)) return false;
      if (state.seenReplyTweetIds.includes(tweetId)) return false;
      if (state.blockedReplyTweetIds.includes(tweetId)) return false;
      if (this.isSelfCandidate(tweet)) return false;

      return true;
    });

    if (!filteredCandidates.length) {
      console.log("[x-growth] no fresh candidate tweets after filtering");
      return;
    }

    const allowedTweetIds = new Set(
      filteredCandidates.map((tweet) => normalizeTweetId(tweet.tweetId)),
    );

    console.log(
      "[x-growth] engage candidates=",
      JSON.stringify(
        filteredCandidates.map((tweet) => ({
          tweetId: tweet.tweetId,
          authorId: tweet.authorId ?? "",
          username: tweet.username ?? "",
          createdAt: tweet.createdAt ?? "",
          conversationId: tweet.conversationId ?? "",
          text: asString(tweet.text).slice(0, 180),
        })),
        null,
        2,
      ),
    );

    const workflowResult = await runOneAIWorkflow({
      task: "x_engage",
      input: {
        message:
          "Review these candidate tweets and reply only when: 1) the tweet is likely open to public replies, 2) the author appears to welcome discussion, and 3) the interaction creates real credibility, useful visibility, or builder-grade positioning for OneAI. IMPORTANT: output reply tasks only. Never output a standalone post. Avoid tweets that look like restricted brand announcements, gated conversations, or posts where replies may be limited to mentioned or already-engaged users.",
        lang: "en",
        candidateTweets: filteredCandidates,
      },
    });

    console.log(
      "[x-growth] engage workflowResult=",
      JSON.stringify(workflowResult, null, 2),
    );

    const task = extractOneClawTask(workflowResult);
    if (!task) {
      console.log("[x-growth] engage returned no executable task");
      return;
    }

    const rawSteps = asArray<GrowthStep>(task.steps);
    this.logStepSummary("[x-growth] engage raw", rawSteps);

    const mixedPostDetected = rawSteps.some((step) => this.isPostStep(step));
    if (mixedPostDetected) {
      console.warn(
        "[x-growth] engage produced non-reply steps; they will be dropped",
      );
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

    const executableSteps = this.toExecutableSteps(
      validRawSteps.map((step) => ({
        ...step,
        input: {
          ...(step.input ?? {}),
          mode: "reply_only",
          strictReply: true,
        },
      })),
      "engage",
    );

    if (!executableSteps.length) {
      console.log("[x-growth] engage task filtered to zero allowed reply steps");
      return;
    }

    console.log(
      "[x-growth] engage approved reply targets=",
      JSON.stringify(
        executableSteps.map((step) => ({
          id: step.id,
          action: step.action,
          replyToTweetId: asString(step.input?.replyToTweetId),
          content: asString(step.input?.content),
          strictReply: step.input?.strictReply,
          mode: asString(step.input?.mode),
        })),
        null,
        2,
      ),
    );

    const taskResult = await executeOneClawTask({
      taskName: task.taskName,
      approvalMode: "auto",
      steps: executableSteps,
    });

    const restrictedReplyTargets = this.collectRestrictedReplyTargets(taskResult);

    const newState = this.stateStore.load();
    newState.lastEngageRunAt = nowIso();

    if (restrictedReplyTargets.length) {
      for (const tweetId of restrictedReplyTargets) {
        this.stateStore.addBlockedReplyTweetId(newState, tweetId);
      }

      console.warn(
        "[x-growth] blocked restricted reply targets=",
        JSON.stringify(restrictedReplyTargets, null, 2),
      );
    }

    for (const step of executableSteps) {
      const replyToTweetId = asString(step.input?.replyToTweetId);
      const content = asString(step.input?.content);

      if (replyToTweetId && !restrictedReplyTargets.includes(replyToTweetId)) {
        this.stateStore.addSeenReplyTweetId(newState, replyToTweetId);
      }

      if (content) {
        const hash = this.stateStore.hashContent(content);
        this.stateStore.addSeenContentHash(newState, hash);
      }
    }

    newState.dailyReplyCount += executableSteps.length;
    newState.failureStreak = 0;

    this.stateStore.save(newState);
  }

  async runLoop(): Promise<void> {
    try {
      await this.runPublisher();
    } catch (error) {
      console.error("[x-growth] publisher failed:", error);
      const state = this.stateStore.load();
      state.failureStreak += 1;
      this.stateStore.save(state);
    }

    try {
      await this.runEngage();
    } catch (error) {
      console.error("[x-growth] engage failed:", error);
      const state = this.stateStore.load();
      state.failureStreak += 1;
      this.stateStore.save(state);
    }
  }
}