import "dotenv/config";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";

const port = Number(process.env.PORT || 4000);
const host = "0.0.0.0";
const app = createApp();

const server = app.listen(port, host, () => {
  console.log(`Ultimate Router API listening on ${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(() => {
    pool.end().catch(() => {}).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
