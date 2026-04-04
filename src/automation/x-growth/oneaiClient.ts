export async function runOneAIWorkflow<TInput>(payload: {
  task: string;
  input: TInput;
}) {
  const baseUrl =
    process.env.ONEAI_API_BASE_URL ??
    process.env.ONEAI_BASE_URL ??
    "http://localhost:3000";

  const adminKey =
    process.env.ONEAI_ADMIN_API_KEY ??
    process.env.ONEAI_ADMIN_KEY ??
    "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (adminKey) {
    headers["x-api-key"] = adminKey;
    headers["x-admin-key"] = adminKey;
  }

  const res = await fetch(`${baseUrl}/v1/workflows/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`OneAI workflow failed: ${res.status} ${text}`);
  }

  return json;
}