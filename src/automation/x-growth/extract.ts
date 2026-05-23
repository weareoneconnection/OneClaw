import type { OneClawAction } from "../../clients/oneclawClient.js";

type OneClawStep = {
  id: string;
  action: OneClawAction;
  input: Record<string, unknown>;
  dependsOn?: string[];
};

type OneClawTask = {
  taskName: string;
  approvalMode?: "auto" | "manual";
  steps: OneClawStep[];
};

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneClawAction(value: string): value is OneClawAction {
  return [
    "api.request",
    "browser.open",
    "browser.screenshot",
    "file.read",
    "file.write",
    "message.send",
    "social.post",
    "x.searchRecentTweets",
    "x.getTweet",
    "git.repo.get",
    "git.repo.search",
    "git.actions.runs",
    "git.issue.create",
    "git.pr.create",
    "email.draft",
    "email.send",
    "calendar.event.create",
    "knowledge.query",
    "knowledge.upsert",
  ].includes(value);
}

function normalizeStep(
  step: unknown,
  index: number,
): OneClawStep | null {
  if (!isObject(step)) return null;

  const rawAction = asString(step.action);
  if (!isOneClawAction(rawAction)) return null;

  const rawInput = isObject(step.input) ? step.input : {};
  const id = asString(step.id) || `step_${index + 1}`;
  const dependsOn = asStringArray(step.dependsOn);

  return {
    id,
    action: rawAction,
    input: rawInput,
    dependsOn,
  };
}

export function extractOneClawTask(result: unknown): OneClawTask | null {
  if (!isObject(result)) return null;

  const root = result as Record<string, unknown>;
  const data =
    isObject(root.data)
      ? (root.data as Record<string, unknown>)
      : root;

  const shouldExecute = Boolean(data.shouldExecute);
  const envelope = isObject(data.theoneTask)
    ? (data.theoneTask as Record<string, unknown>)
    : null;
  const task = isObject(envelope?.oneclawTask)
    ? envelope.oneclawTask
    : data.oneclawTask;

  if (!shouldExecute || !isObject(task)) {
    return null;
  }

  const policy = isObject(envelope?.automationPolicy)
    ? (envelope.automationPolicy as Record<string, unknown>)
    : null;
  const rawApprovalMode = asString(policy?.approvalMode);
  const approvalMode =
    rawApprovalMode === "manual" || rawApprovalMode === "auto"
      ? rawApprovalMode
      : undefined;
  const taskName = asString(task.taskName) || "oneclaw_task";
  const rawSteps = Array.isArray(task.steps) ? task.steps : [];

  const seenIds = new Set<string>();
  const steps: OneClawStep[] = [];

  for (let i = 0; i < rawSteps.length; i += 1) {
    const normalized = normalizeStep(rawSteps[i], i);
    if (!normalized) continue;

    let finalId = normalized.id;
    if (seenIds.has(finalId)) {
      finalId = `${finalId}_${i + 1}`;
    }
    seenIds.add(finalId);

    steps.push({
      ...normalized,
      id: finalId,
    });
  }

  if (!steps.length) {
    return null;
  }

  return {
    taskName,
    ...(approvalMode ? { approvalMode } : {}),
    steps,
  };
}
