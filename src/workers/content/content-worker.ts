// src/workers/content/content-worker.ts

import type {
  ExecutionContext,
  Worker,
  WorkerExecutionResult,
} from "../../types/capability.js";
import type { Json } from "../../types/task.js";

function asString(value: Json | undefined): string {
  return String(value ?? "").trim();
}

export class ContentWorker implements Worker {
  readonly name = "content_worker";

  async execute(
    input: Record<string, Json>,
    context: ExecutionContext,
  ): Promise<WorkerExecutionResult> {
    await context.log(`ContentWorker executing ${context.action}`);

    const type = asString(input.type || "text");
    const topic = asString(input.topic || "general");
    const lang = asString(input.lang || "en");
    const tone = asString(input.tone || "clear");
    const requirements = asString(input.requirements || "");

    let generatedText = "";

    // 先做一个最小可用版本
    // 后面你再替换成真实 LLM 调用
    if (type === "poem" && lang.startsWith("zh")) {
      generatedText = [
        "我们相遇在信号之间，",
        "连接着彼此的时间，",
        "从微光到共振的边缘，",
        `围绕 ${topic} ，我们并肩向前。`,
      ].join("\n");
    } else if (type === "poem") {
      generatedText = [
        "We meet between signals and light,",
        "Connected through vision in the night,",
        `Around ${topic}, we rise as one,`,
        "Until the work of tomorrow is done.",
      ].join("\n");
    } else if (type === "tweet") {
      generatedText = `Building around ${topic}.\n\nSignal → coordination → execution.\n\n${requirements}`.trim();
    } else if (type === "announcement") {
      generatedText = `Announcement: ${topic}\n\nTone: ${tone}\n${requirements}`.trim();
    } else {
      generatedText = `${type}: ${topic}${requirements ? `\n\n${requirements}` : ""}`;
    }

    await context.log(`Content generated successfully`);

    return {
      ok: true,
      output: {
        content: generatedText,
        type,
        topic,
        lang,
        tone,
      },
    };
  }
}