import { app } from "./app.js";
import { configWarnings, env } from "./config.js";
import { pool } from "./db/index.js";

const server = app.listen(env.port, (err?: Error) => {
  if (err) throw err;
  console.log(`API listening on http://localhost:${env.port}/api`);
  for (const warning of configWarnings()) console.warn(`[config] ${warning}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  // Don't hang forever on slow connections (e.g. an in-flight try-on).
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
