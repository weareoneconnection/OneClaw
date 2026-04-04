export async function runOneAIWorkflow<TInput>(payload: {
  task: string;
  input: TInput;
}) {
  const baseUrl =
    process.env.ONEAI_API_BASE_URL ??
    process.env.ONEAI_BASE_URL ??
    "https://oneai-api-production.up.railway.app";

  const adminKey =
    process.env.ONEAI_ADMIN_API_KEY ??
    process.env.ONEAI_ADMIN_KEY ??
    process.env.ONEAI_API_KEY ??
    "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (adminKey) {
    headers["x-api-key"] = adminKey;
    headers["x-admin-key"] = adminKey;
  }

  // 🔥 关键：改 endpoint
  const res = await fetch(`${baseUrl}/v1/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      task: payload.task,
      input: payload.input,
    }),
  });

  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`OneAI generate failed: ${res.status} ${text}`);
  }

  // 🔥 关键：兼容不同返回结构
  // 有些版本返回 { data: {...} }
  // 有些直接返回 {...}
  if (json?.data) {
    return json.data;
  }

  return json;
}