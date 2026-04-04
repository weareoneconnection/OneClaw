export type OneClawAction =
  | "api.request"
  | "browser.open"
  | "browser.screenshot"
  | "file.read"
  | "file.write"
  | "message.send"
  | "social.post";

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