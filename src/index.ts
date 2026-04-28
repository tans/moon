import app from "./app";
import { getConfig } from "./config";
import { startExpirationReminderJob } from "./ai/reminder";

const config = getConfig();
const port = config.app.port;

Bun.serve({
  port,
  fetch: app.fetch,
});

// Start subscription expiration reminder background job
startExpirationReminderJob();

console.log(`MOON running on http://localhost:${port}`);
