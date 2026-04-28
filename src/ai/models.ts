// Model definitions for AI routing

export interface ModelConfig {
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'kimi' | 'minimax' | 'qwen' | 'deepseek';
  tier: '🌕' | '🌓' | '🌑';
  inputCostPer1M: number;  // cost per 1M tokens (USD)
  outputCostPer1M: number;
  supportsSystemPrompt: boolean;
  maxTokens: number;
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // 🌕 Full Moon Tier - Premium models
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'openai',
    tier: '🌕',
    inputCostPer1M: 5,
    outputCostPer1M: 15,
    supportsSystemPrompt: true,
    maxTokens: 128000,
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: '🌕',
    inputCostPer1M: 0.375,
    outputCostPer1M: 1.5,
    supportsSystemPrompt: true,
    maxTokens: 128000,
  },
  'claude-sonnet-4-20250514': {
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: '🌕',
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsSystemPrompt: true,
    maxTokens: 200000,
  },
  'claude-3-5-sonnet-20241022': {
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    tier: '🌕',
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsSystemPrompt: true,
    maxTokens: 200000,
  },
  'gemini-2.0-flash': {
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    tier: '🌕',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    supportsSystemPrompt: true,
    maxTokens: 1000000,
  },

  // 🌓 Half Moon Tier - Efficient models
  'kimi-core': {
    name: 'Kimi Core',
    provider: 'kimi',
    tier: '🌓',
    inputCostPer1M: 12,
    outputCostPer1M: 12,
    supportsSystemPrompt: true,
    maxTokens: 128000,
  },
  'abab6.5s': {
    name: 'MiniMax ABAB 6.5S',
    provider: 'minimax',
    tier: '🌓',
    inputCostPer1M: 1,
    outputCostPer1M: 1,
    supportsSystemPrompt: true,
    maxTokens: 245760,
  },
  'qwen-turbo': {
    name: 'Qwen Turbo',
    provider: 'qwen',
    tier: '🌓',
    inputCostPer1M: 0.8,
    outputCostPer1M: 2,
    supportsSystemPrompt: true,
    maxTokens: 131072,
  },

  // 🌑 New Moon Tier - Lightweight models
  'gpt-4o-mini-search': {
    name: 'GPT-4o Mini (Search)',
    provider: 'openai',
    tier: '🌑',
    inputCostPer1M: 0.375,
    outputCostPer1M: 1.5,
    supportsSystemPrompt: true,
    maxTokens: 128000,
  },
  'qwen-long': {
    name: 'Qwen Long',
    provider: 'qwen',
    tier: '🌑',
    inputCostPer1M: 0.8,
    outputCostPer1M: 2,
    supportsSystemPrompt: true,
    maxTokens: 1000000,
  },
  'deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    tier: '🌑',
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    supportsSystemPrompt: true,
    maxTokens: 384000,
  },
};

// Default model for each tier
export const DEFAULT_MODELS = {
  '🌕': 'gpt-4o',
  '🌓': 'kimi-core',
  '🌑': 'gpt-4o-mini-search',
};

// Model to use for each tier
export function getModelForTier(tier: '🌕' | '🌓' | '🌑'): string {
  return DEFAULT_MODELS[tier];
}
