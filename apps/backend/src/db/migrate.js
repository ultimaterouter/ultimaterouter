import "dotenv/config";
import { pool } from "./pool.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, "../../migrations/001_initial.sql");
const client = await pool.connect();

try {
  await client.query("BEGIN");
  // Serialize concurrent deploys so two replicas cannot apply the same migration twice.
  await client.query("SELECT pg_advisory_xact_lock(8812345678901234567::bigint)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const name = path.basename(migrationPath);
  const existing = await client.query(
    "SELECT 1 FROM schema_migrations WHERE name = $1",
    [name]
  );

  if (existing.rowCount === 0) {
    const sql = await readFile(migrationPath, "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
    console.log(`Applied migration: ${name}`);
  } else {
    console.log(`Migration already applied: ${name}`);
  }
  await client.query("COMMIT");
} catch (error) {
  try { await client.query("ROLLBACK"); } catch { /* no active transaction */ }
  // Do not print the raw error: it may include the database connection string.
  console.error("Migration failed:", error?.code || "unknown");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
