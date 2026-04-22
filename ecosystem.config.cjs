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
        L1_PROVIDER: "anthropic",
        L1_BASE_URL: "https://api.svips.org",
        L1_API_KEY: "sk-cb0450e1b87f6ab91813e1383b30dae3929617ebb27bcca6344e1dd0600d14db",
        L1_MODEL: "MiniMax-M2.7",
        L2_PROVIDER: "anthropic",
        L2_BASE_URL: "https://api.svips.org",
        L2_API_KEY: "sk-cb0450e1b87f6ab91813e1383b30dae3929617ebb27bcca6344e1dd0600d14db",
        L2_MODEL: "MiniMax-M2.7",
        L3_PROVIDER: "anthropic",
        L3_BASE_URL: "https://api.svips.org",
        L3_API_KEY: "sk-cb0450e1b87f6ab91813e1383b30dae3929617ebb27bcca6344e1dd0600d14db",
        L3_MODEL: "MiniMax-M2.7",
      },
    },
  ],
};
