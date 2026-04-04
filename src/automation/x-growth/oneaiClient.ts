export async function runOneAIWorkflow<TInput>(payload: {
  task: string;
  input: TInput;
}) {
  let baseUrl =
    process.env.ONEAI_API_BASE_URL ??
    process.env.ONEAI_BASE_URL ??
    "https://oneai-api-production.up.railway.app";

  if (
    !baseUrl.startsWith("http://") &&
    !baseUrl.startsWith("https://")
  ) {
    baseUrl = `https://${baseUrl}`;
  }

  const adminKey =
    process.env.ONEAI_ADMIN_API_KEY ??
    process.env.ONEAI_ADMIN_KEY ??
    process.env.ONEAI_API_KEY ??
    "";

  if (!adminKey) {
    throw new Error(
      "Missing OneAI admin key: set ONEAI_ADMIN_API_KEY, ONEAI_ADMIN_KEY, or ONEAI_API_KEY",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": adminKey,
    "x-admin-key": adminKey,
  };

  const res = await fetch(`${baseUrl}/v1/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: payload.task,
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
    throw new Error(`OneAI generate failed: ${res.status} ${text}`);
  }
  console.log("[oneaiClient] requestBody=", JSON.stringify({
  type: payload.task,
  input: payload.input,
}));
  return json;
}