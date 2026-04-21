import { MODEL_CONFIGS, getModelForTier, type ModelConfig } from './models';

// API Keys configuration
interface AIKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  kimi?: string;
  minimax?: string;
  qwen?: string;
}

function getAPIKeys(): AIKeys {
  return {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    kimi: process.env.KIMI_API_KEY,
    minimax: process.env.MINIMAX_API_KEY,
    qwen: process.env.QWEN_API_KEY,
  };
}

export interface AIRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUSD: number;
  };
  provider: string;
}

export interface AIRoutingOptions {
  preferredTier?: '🌕' | '🌓' | '🌑';
  fallbackEnabled?: boolean;
  userId?: string;
}

// Route to specific AI provider
async function routeToProvider(
  provider: string,
  model: string,
  messages: AIRequest['messages'],
  temperature?: number,
  maxTokens?: number
): Promise<AIResponse> {
  const keys = getAPIKeys();

  switch (provider) {
    case 'openai': {
      if (!keys.openai) throw new Error('OpenAI API key not configured');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys.openai}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }
      const data = await response.json() as {
        usage?: { prompt_tokens: number; completion_tokens: number };
        choices: Array<{ message: { content: string } }>;
        model?: string;
      };
      const config = MODEL_CONFIGS[model];
      const inputCost = ((data.usage?.prompt_tokens ?? 0) / 1000000) * (config?.inputCostPer1M ?? 0);
      const outputCost = ((data.usage?.completion_tokens ?? 0) / 1000000) * (config?.outputCostPer1M ?? 0);
      return {
        content: data.choices[0].message.content,
        model: data.model ?? model,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          totalCostUSD: inputCost + outputCost,
        },
        provider: 'openai',
      };
    }

    case 'anthropic': {
      if (!keys.anthropic) throw new Error('Anthropic API key not configured');
      const systemMsg = messages.find(m => m.role === 'system');
      const otherMsgs = messages.filter(m => m.role !== 'system');
      const body: Record<string, unknown> = {
        model,
        messages: otherMsgs,
        temperature,
        max_tokens: maxTokens ?? 4096,
      };
      if (systemMsg) body.system = systemMsg.content;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': keys.anthropic,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }
      const data = await response.json() as {
        usage?: { input_tokens: number; output_tokens: number };
        content: Array<{ text: string }>;
        model?: string;
      };
      const config = MODEL_CONFIGS[model];
      const inputCost = ((data.usage?.input_tokens ?? 0) / 1000000) * (config?.inputCostPer1M ?? 0);
      const outputCost = ((data.usage?.output_tokens ?? 0) / 1000000) * (config?.outputCostPer1M ?? 0);
      return {
        content: data.content[0].text,
        model: data.model ?? model,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
          totalCostUSD: inputCost + outputCost,
        },
        provider: 'anthropic',
      };
    }

    case 'google': {
      if (!keys.google) throw new Error('Google API key not configured');
      const systemMsg = messages.find(m => m.role === 'system');
      const otherMsgs = messages.filter(m => m.role !== 'system');
      const contents = otherMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };
      if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.google}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google API error: ${response.status} - ${error}`);
      }
      const data = await response.json() as {
        usage?: { promptTokenCount?: number; candidatesTokenCount?: number };
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      const config = MODEL_CONFIGS[model];
      const inputTokens = data.usage?.promptTokenCount ?? 0;
      const outputTokens = data.usage?.candidatesTokenCount ?? 0;
      const inputCost = (inputTokens / 1000000) * (config?.inputCostPer1M ?? 0);
      const outputCost = (outputTokens / 1000000) * (config?.outputCostPer1M ?? 0);
      return {
        content: data.candidates[0].content.parts[0].text,
        model,
        usage: {
          inputTokens,
          outputTokens,
          totalCostUSD: inputCost + outputCost,
        },
        provider: 'google',
      };
    }

    case 'kimi': {
      if (!keys.kimi) throw new Error('Kimi API key not configured');
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys.kimi}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Kimi API error: ${response.status} - ${error}`);
      }
      const data = await response.json() as {
        usage?: { prompt_tokens: number; completion_tokens: number };
        choices: Array<{ message: { content: string } }>;
        model?: string;
      };
      const config = MODEL_CONFIGS[model];
      const inputCost = ((data.usage?.prompt_tokens ?? 0) / 1000000) * (config?.inputCostPer1M ?? 0);
      const outputCost = ((data.usage?.completion_tokens ?? 0) / 1000000) * (config?.outputCostPer1M ?? 0);
      return {
        content: data.choices[0].message.content,
        model: data.model ?? model,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          totalCostUSD: inputCost + outputCost,
        },
        provider: 'kimi',
      };
    }

    case 'minimax': {
      if (!keys.minimax) throw new Error('MiniMax API key not configured');
      const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys.minimax}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`MiniMax API error: ${response.status} - ${error}`);
      }
      const data = await response.json() as {
        usage?: { prompt_tokens: number; completion_tokens: number };
        choices: Array<{ message: { content: string } }>;
        model?: string;
      };
      const config = MODEL_CONFIGS[model];
      const inputCost = ((data.usage?.prompt_tokens ?? 0) / 1000000) * (config?.inputCostPer1M ?? 0);
      const outputCost = ((data.usage?.completion_tokens ?? 0) / 1000000) * (config?.outputCostPer1M ?? 0);
      return {
        content: data.choices[0].message.content,
        model: data.model ?? model,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          totalCostUSD: inputCost + outputCost,
        },
        provider: 'minimax',
      };
    }

    case 'qwen': {
      if (!keys.qwen) throw new Error('Qwen API key not configured');
      const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys.qwen}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Qwen API error: ${response.status} - ${error}`);
      }
      const data = await response.json() as {
        usage?: { prompt_tokens: number; completion_tokens: number };
        choices: Array<{ message: { content: string } }>;
        model?: string;
      };
      const config = MODEL_CONFIGS[model];
      const inputCost = ((data.usage?.prompt_tokens ?? 0) / 1000000) * (config?.inputCostPer1M ?? 0);
      const outputCost = ((data.usage?.completion_tokens ?? 0) / 1000000) * (config?.outputCostPer1M ?? 0);
      return {
        content: data.choices[0].message.content,
        model: data.model ?? model,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          totalCostUSD: inputCost + outputCost,
        },
        provider: 'qwen',
      };
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Main AI routing function with automatic tier fallback
export async function routeAIRequest(
  request: AIRequest,
  options: AIRoutingOptions = {}
): Promise<AIResponse> {
  const { fallbackEnabled = true } = options;
  const modelConfig = MODEL_CONFIGS[request.model];

  if (!modelConfig) {
    throw new Error(`Unknown model: ${request.model}`);
  }

  // Try the requested model first
  try {
    return await routeToProvider(
      modelConfig.provider,
      request.model,
      request.messages,
      request.temperature,
      request.maxTokens
    );
  } catch (error) {
    if (!fallbackEnabled) throw error;

    // Try fallback models in order of tier
    const tierOrder: Array<'🌕' | '🌓' | '🌑'> = ['🌕', '🌓', '🌑'];
    const currentTierIndex = tierOrder.indexOf(modelConfig.tier);

    // Try lower tiers as fallback
    for (let i = currentTierIndex + 1; i < tierOrder.length; i++) {
      const fallbackTier = tierOrder[i];
      const fallbackModel = getModelForTier(fallbackTier);
      const fallbackConfig = MODEL_CONFIGS[fallbackModel];

      if (!fallbackConfig) continue;

      try {
        console.log(`[AI Router] ${request.model} failed, falling back to ${fallbackModel}`);
        return await routeToProvider(
          fallbackConfig.provider,
          fallbackModel,
          request.messages,
          request.temperature,
          request.maxTokens
        );
      } catch {
        // Continue to next tier
      }
    }

    throw error;
  }
}

// Get available models for a tier
export function getModelsForTier(tier: '🌕' | '🌓' | '🌑'): ModelConfig[] {
  return Object.values(MODEL_CONFIGS).filter(config => config.tier === tier);
}

// Check which providers are configured
export function getConfiguredProviders(): string[] {
  const keys = getAPIKeys();
  return Object.entries(keys)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

// Calculate cost for a request
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const config = MODEL_CONFIGS[model];
  if (!config) return 0;
  const inputCost = (inputTokens / 1000000) * config.inputCostPer1M;
  const outputCost = (outputTokens / 1000000) * config.outputCostPer1M;
  return inputCost + outputCost;
}