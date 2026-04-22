export interface ModelSource {
  provider: "openai" | "anthropic";
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface Config {
  l1: ModelSource | null;
  l2: ModelSource | null;
  l3: ModelSource | null;
}

function getSource(tier: "L1" | "L2" | "L3"): ModelSource | null {
  const provider = process.env[`${tier}_PROVIDER`];
  const baseURL = process.env[`${tier}_BASE_URL`];
  const apiKey = process.env[`${tier}_API_KEY`];
  const model = process.env[`${tier}_MODEL`];

  if (!provider || !baseURL || !apiKey || !model) {
    return null;
  }

  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`Invalid provider for ${tier}: ${provider}`);
  }

  return { provider, baseURL, apiKey, model };
}

export function loadConfig(): Config {
  return {
    l1: getSource("L1"),
    l2: getSource("L2"),
    l3: getSource("L3"),
  };
}

export const config = loadConfig();
