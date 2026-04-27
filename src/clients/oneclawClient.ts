export type OneClawAction =
  | "api.request"
  | "api.webhook"
  | "browser.open"
  | "browser.screenshot"
  | "browser.extract"
  | "browser.click"
  | "browser.type"
  | "file.read"
  | "file.write"
  | "file.append"
  | "file.list"
  | "message.draft"
  | "message.notify"
  | "message.send"
  | "social.post"
  | "human.approval.request"
  | "human.confirmation.request"
  | "construction.task.create"
  | "construction.approval.request"
  | "construction.procurement.followup"
  | "construction.inspection.create"
  | "construction.hse.corrective_action"
  | "construction.qaqc.ncr.create"
  | "construction.rfi.create"
  | "construction.change_order.prepare"
  | "construction.schedule.recovery_plan"
  | "construction.contract.claim_prepare"
  | "construction.budget.variance_review";

export type OneClawTaskRequest = {
  taskName: string;
  approvalMode?: "auto" | "manual";
  steps: Array<{
    id: string;
    action: OneClawAction;
    input: Record<string, unknown>;
    dependsOn?: string[];
  }>;
};

function getBaseUrl(): string {
  return (
    process.env.ONECLAW_API_BASE_URL ??
    process.env.ONECLAW_BASE_URL ??
    "https://oneclaw-production.up.railway.app"
  );
}

function getHeaders(): Record<string, string> {
  const token =
    process.env.ONECLAW_INTERNAL_TOKEN ??
    process.env.ONECLAW_ADMIN_TOKEN ??
    "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

export async function executeOneClawTask(task: OneClawTaskRequest) {
  const res = await fetch(`${getBaseUrl()}/v1/tasks/run`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      approvalMode: task.approvalMode ?? "auto",
      taskName: task.taskName,
      steps: task.steps,
    }),
  });

  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`OneClaw task failed: ${res.status} ${text}`);
  }

  return json;
}

export async function executeOneClawAction(payload: {
  action: OneClawAction;
  approvalMode?: "auto" | "manual";
  input: Record<string, unknown>;
}) {
  const res = await fetch(`${getBaseUrl()}/v1/actions/execute`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      approvalMode: payload.approvalMode ?? "auto",
      action: payload.action,
      input: payload.input,
    }),
  });

  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`OneClaw action failed: ${res.status} ${text}`);
  }

  return json;
}
