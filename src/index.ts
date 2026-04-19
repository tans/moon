import app from "./app";

const port = Number(process.env.PORT ?? 8787);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`MOON running on http://localhost:${port}`);
