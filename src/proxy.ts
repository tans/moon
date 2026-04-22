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
  const isAnthropic = source.provider === "anthropic";
  const url = isAnthropic
    ? `${source.baseURL}/v1/messages`
    : `${source.baseURL}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (isAnthropic) {
    headers["x-api-key"] = source.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${source.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const responseClone = response.clone();

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    try {
      data = await responseClone.text();
    } catch (e: unknown) {
      return {
        ok: false,
        status: response.status,
        data: { error: { message: `Failed to read response: ${e}` } },
        headers: {},
      };
    }
  }

  const respHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    respHeaders[key] = value;
  });

  return {
    ok: response.ok,
    status: response.status,
    data,
    headers: respHeaders,
  };
}

export async function callModelStream(
  source: ModelSource,
  body: Record<string, unknown>
): Promise<Response> {
  const isAnthropic = source.provider === "anthropic";
  const url = isAnthropic
    ? `${source.baseURL}/v1/messages`
    : `${source.baseURL}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (isAnthropic) {
    headers["x-api-key"] = source.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${source.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, stream: true }),
  });

  return response;
}