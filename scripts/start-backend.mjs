// Production entrypoint for Railway (and any container host).
// Runs from the repository root so npm workspaces resolve correctly.
// Fail fast on missing configuration without printing any secret values.

const required = ["DATABASE_URL"];
const missing = required.filter((key) => !process.env[key]?.trim());
// Railway injects PORT; containers default to the Dockerfile's EXPOSE value.
if (!process.env.PORT) process.env.PORT = "8080";
const port = Number(process.env.PORT);
const isProduction = process.env.NODE_ENV === "production";
const rawOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);

if (missing.length) {
  console.error(`Cannot start: missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Cannot start: PORT must be an integer between 1 and 65535.");
  process.exit(1);
}
if (isProduction && (rawOrigins.length === 0 || rawOrigins.includes("*"))) {
  console.error("Cannot start: production requires an explicit CORS_ORIGIN allowlist (no wildcard).");
  process.exit(1);
}

console.log(`Ultimate Router API starting on 0.0.0.0:${port}`);
await import("../apps/backend/src/server.js");
