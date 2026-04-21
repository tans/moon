module.exports = {
  apps: [
    {
      name: "moon",
      script: "src/index.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
        PORT: "8787",
        SQLITE_PATH: "./data/moon.sqlite",
        ANTHROPIC_AUTH_TOKEN: "sk-2a47241f6408805becd7df967bd91b304859841619cd3f084478852a29a6c5",
        ANTHROPIC_BASE_URL: "https://api.svips.org",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M2.7",
        ANTHROPIC_MODEL: "MiniMax-M2.7",
        ANTHROPIC_REASONING_MODEL: "MiniMax-M2.7",
        API_TIMEOUT_MS: "3000000",
      },
    },
  ],
};
