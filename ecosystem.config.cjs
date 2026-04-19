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
      },
    },
  ],
};
