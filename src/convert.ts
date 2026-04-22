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
      prompt: messagesToAnthropicPrompt(req.messages),
      max_tokens: 4096,
      stream: req.stream,
    },
  };
}

export function anthropicToOpenAI(req: AnthropicRequest, targetModel: string): ConvertedRequest {
  return {
    provider: "openai",
    body: {
      model: targetModel,
      messages: anthropicPromptToMessages(req.prompt || ""),
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

  // 同格式或未知格式，直接传递
  const body = { ...req } as Record<string, unknown>;
  if (body.model) body.model = targetModel;
  return {
    provider: targetProvider,
    body,
  };
}