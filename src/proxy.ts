import type { ModelSource } from "./config";

export interface ProxyResponse {
  ok: boolean;
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export async function callModel(
  source: ModelSource,
  body: Record<string, unknown>
): Promise<ProxyResponse> {
  const url = `${source.baseURL}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${source.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000), // 添加超时
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    ok: response.ok,
    status: response.status,
    data,
    headers,
  };
}

export async function callModelStream(
  source: ModelSource,
  body: Record<string, unknown>
): Promise<Response> {
  const url = `${source.baseURL}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${source.apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  return response;
}