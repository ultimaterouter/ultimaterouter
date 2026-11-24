import pg from "pg";

const { Pool } = pg;

// Railway PostgreSQL is SSL-enabled. Local Docker PostgreSQL is not.
// If DATABASE_URL itself contains sslmode, node-postgres parses that and
// overrides this object, so either mechanism enables TLS as needed.
function resolveSsl() {
  const mode = (process.env.DATABASE_SSL || "").toLowerCase();
  if (["disable", "false", "off", "0"].includes(mode)) return false;
  if (["require", "true", "on", "1"].includes(mode)) return { rejectUnauthorized: false };
  if (["verify", "verify-full", "verifyfull"].includes(mode)) return {};
  return process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSsl(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on("error", (error) => {
  // Never print error.message here: it may contain connection details.
  console.error("Unexpected PostgreSQL pool error:", error?.code || "unknown");
});
