import type { ChatMessage, OpenAIRequest, AnthropicRequest } from "./parser";

export interface ConvertedRequest {
  provider: "openai" | "anthropic";
  body: Record<string, unknown>;
}

function messagesToAnthropicPrompt(messages: ChatMessage[]): string {
  return messages.map(m => `${m.role}: ${m.content}`).join("\n");
}

function anthropicPromptToMessages(prompt: string): ChatMessage[] {
  return [{ role: "user", content: prompt }];
}

export function openaiToAnthropic(req: OpenAIRequest, targetModel: string): ConvertedRequest {
  return {
    provider: "anthropic",
    body: {
      model: targetModel,
      messages: req.messages,
      max_tokens: 4096,
      stream: req.stream,
    },
  };
}

export function anthropicToOpenAI(req: AnthropicRequest, targetModel: string): ConvertedRequest {
  const maybePrompt = (req as unknown as { prompt?: unknown }).prompt;
  const prompt = typeof maybePrompt === "string" ? maybePrompt : "";

  return {
    provider: "openai",
    body: {
      model: targetModel,
      messages: anthropicPromptToMessages(prompt),
      stream: req.stream,
    },
  };
}

export function convertRequest(
  req: OpenAIRequest | AnthropicRequest,
  targetProvider: "openai" | "anthropic",
  targetModel: string
): ConvertedRequest {
  const isOpenAI = "messages" in req;

  if (isOpenAI && targetProvider === "anthropic") {
    return openaiToAnthropic(req as OpenAIRequest, targetModel);
  }

  if (!isOpenAI && targetProvider === "openai") {
    return anthropicToOpenAI(req as AnthropicRequest, targetModel);
  }

  // Same format or unknown format, pass through
  const body = { ...req } as Record<string, unknown>;
  if (body.model) body.model = targetModel;
  return {
    provider: targetProvider,
    body,
  };
}
