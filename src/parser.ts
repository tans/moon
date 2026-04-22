// src/parser.ts

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenAIRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  tier?: string;
  // 其他字段保留
  [key: string]: unknown;
}

export interface AnthropicRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  tier?: string;
  // 其他字段保留
  [key: string]: unknown;
}

export interface ParsedRequest {
  tier: "L1" | "L2" | "L3";
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  rawRequest: Record<string, unknown>;
}

export function parseOpenAIRequest(body: unknown): OpenAIRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  return body as OpenAIRequest;
}

export function parseAnthropicRequest(body: unknown): AnthropicRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  return body as AnthropicRequest;
}

export function parseRequest(
  body: unknown,
  defaultTier: "L1" | "L2" | "L3"
): ParsedRequest {
  const req = body as Record<string, unknown>;

  let tier = defaultTier;
  if (typeof req.tier === "string" && ["L1", "L2", "L3"].includes(req.tier)) {
    tier = req.tier as "L1" | "L2" | "L3";
  }

  const messages = (req.messages as ChatMessage[]) || [];
  const stream = req.stream === true;

  return {
    tier,
    model: typeof req.model === "string" ? req.model : tier,
    messages,
    stream,
    rawRequest: req,
  };
}