import path from "node:path";
import { XAdapter } from "../../adapters/x/x-adapter.js";
import { executeOneClawTask } from "../../clients/oneclawClient.js";
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
      dryRun: String(process.env.ONECLAW_X_DRY_RUN ?? "").toLowerCase() === "true",
    });

    const statePath =
      process.env.X_GROWTH_STATE_PATH ??
      path.resolve("./artifacts/x-growth-state.json");

    this.stateStore = new XGrowthStateStore(statePath);
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
          "Generate today's high-signal X publishing plan for the official OneAI account.",
        lang: "en",
        websiteUrl: process.env.ONEAI_WEBSITE_URL ?? "https://oneai.network",
        postureHint: "growth",
      },
    });

    const task = extractOneClawTask(workflowResult);
    if (!task) {
      console.log("[x-growth] publisher returned no executable task");
      return;
    }

    const executableSteps = task.steps.filter((step) => {
      const content = asString(step.input.content);
      return content.length > 0;
    });

    if (!executableSteps.length) {
      console.log("[x-growth] publisher task contains no executable steps");
      return;
    }

    for (const step of executableSteps) {
      const content = asString(step.input.content);
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
    let newReplyCount = 0;

    for (const step of executableSteps) {
      const content = asString(step.input.content);
      const replyToTweetId = asString(step.input.replyToTweetId);

      if (replyToTweetId) {
        newReplyCount += 1;
      } else {
        newPostCount += 1;
      }

      if (content) {
        const hash = this.stateStore.hashContent(content);
        this.stateStore.addSeenContentHash(newState, hash);
      }

      if (replyToTweetId) {
        this.stateStore.addSeenReplyTweetId(newState, replyToTweetId);
      }
    }

    newState.dailyPostCount += newPostCount;
    newState.dailyReplyCount += newReplyCount;
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

    const candidateTweets = await fetchGrowthCandidates(this.xAdapter);
    const freshCandidates = candidateTweets.filter(
      (tweet) => !state.seenReplyTweetIds.includes(tweet.tweetId),
    );

    if (!freshCandidates.length) {
      console.log("[x-growth] no fresh candidate tweets");
      return;
    }

    const workflowResult = await runOneAIWorkflow({
      task: "x_engage",
      input: {
        message:
          "Review these candidate tweets and reply only when strategically valuable for OneAI growth.",
        lang: "en",
        candidateTweets: freshCandidates,
      },
    });

    let task = extractOneClawTask(workflowResult);

if (!task) {
  console.log("[x-growth] fallback: force publish");

  task = {
    taskName: "fallback_publish",
    steps: [
      {
        id: "step_1",
        action: "social.post",
        input: {
          content:
            "Most people are building AI tools.\n\nWe are building AI execution.\n\nOneAI × OneClaw is just getting started.",
        },
      },
    ],
  };
}

    const allowedSteps = task.steps.filter((step) => {
      const replyToTweetId = asString(step.input.replyToTweetId);
      const content = asString(step.input.content);

      if (!replyToTweetId || !content) return false;
      if (state.seenReplyTweetIds.includes(replyToTweetId)) return false;

      const hash = this.stateStore.hashContent(content);
      if (state.seenContentHashes.includes(hash)) return false;

      return true;
    });

    if (!allowedSteps.length) {
      console.log("[x-growth] engage task filtered to zero allowed steps");
      return;
    }

    await executeOneClawTask({
      taskName: task.taskName,
      approvalMode: "auto",
      steps: allowedSteps,
    });

    const newState = this.stateStore.load();
    newState.lastEngageRunAt = nowIso();

    for (const step of allowedSteps) {
      const replyToTweetId = asString(step.input.replyToTweetId);
      const content = asString(step.input.content);

      if (replyToTweetId) {
        this.stateStore.addSeenReplyTweetId(newState, replyToTweetId);
      }

      if (content) {
        const hash = this.stateStore.hashContent(content);
        this.stateStore.addSeenContentHash(newState, hash);
      }
    }

    newState.dailyReplyCount += allowedSteps.length;
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