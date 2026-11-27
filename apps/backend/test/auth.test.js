import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";

process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "https://ultimaterouter.ultimaterouter.workers.dev";

const { createApp } = await import("../src/app.js");
const { hashToken, COOKIE_NAME } = await import("../src/auth.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(here, "../migrations");
const ORIGIN = "https://ultimaterouter.ultimaterouter.workers.dev";

function makeDatabase() {
  const db = newDb();
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => randomUUID()
  });
  for (const name of ["001_initial.sql", "002_auth.sql"]) {
    const sql = readFileSync(path.join(migrationDir, name), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, "");
    db.public.none(sql);
  }
  const { Pool } = db.adapters.createPg();
  return { db, pool: new Pool() };
}

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function call(base, url, options = {}) {
  const { method = "GET", body, cookie, headers = {} } = options;
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      Origin: ORIGIN,
      "X-Requested-With": "XMLHttpRequest",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = {};
  try { json = await response.json(); } catch { /* empty body */ }
  const setCookie = response.headers.get("set-cookie") || "";
  return { status: response.status, json, setCookie, headers: response.headers };
}

function cookieOf(result) {
  if (!result.setCookie) return "";
  return result.setCookie.split(";")[0];
}

test("migrations create additive auth schema", () => {
  const { db } = makeDatabase();
  for (const table of ["app_users", "auth_sessions", "email_verification_tokens"]) {
    assert.ok(db.public.getTable(table), `missing table ${table}`);
  }
});

test("register persists hashed password and returns safe user", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    const result = await call(base, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "Test.User@Example.COM", password: "correct-horse-42", displayName: "Test User", role: "admin" }
    });
    assert.equal(result.status, 201);
    assert.equal(result.json.user.email, "test.user@example.com");
    assert.equal(result.json.user.role, "user");
    assert.equal(result.json.user.emailVerified, false);
    assert.equal(result.json.user.password_hash, undefined);
    assert.match(result.setCookie, /HttpOnly/);
    assert.match(result.setCookie, /SameSite=Lax/);
    assert.ok(result.json.devVerificationToken);

    const stored = await pool.query("SELECT password_hash, role FROM app_users WHERE email_normalized = $1", ["test.user@example.com"]);
    assert.equal(stored.rows[0].role, "user");
    assert.notEqual(stored.rows[0].password_hash, "correct-horse-42");
    assert.match(stored.rows[0].password_hash, /^\$2[aby]\$/);
  });
  await pool.end();
});

test("production session cookie is Secure and SameSite=None", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { pool } = makeDatabase();
    const app = createApp({ pool });
    await withServer(app, async (base) => {
      const result = await call(base, "/api/v1/auth/register", {
        method: "POST",
        body: { email: "cookie@example.com", password: "correct-horse-42" }
      });
      assert.equal(result.status, 201);
      assert.match(result.setCookie, /HttpOnly/);
      assert.match(result.setCookie, /Secure/);
      assert.match(result.setCookie, /SameSite=None/);
      assert.equal(result.json.devVerificationToken, undefined);
    });
    await pool.end();
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("duplicate registration uses a generic error", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    const body = { email: "duplicate@example.com", password: "correct-horse-42" };
    assert.equal((await call(base, "/api/v1/auth/register", { method: "POST", body })).status, 201);
    const duplicate = await call(base, "/api/v1/auth/register", { method: "POST", body });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json.error, "registration_failed");
    assert.equal(JSON.stringify(duplicate.json).toLowerCase().includes("correct-horse-42"), false);
  });
  await pool.end();
});

test("login accepts correct password, rejects wrong password with identical generic error", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    await call(base, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "login@example.com", password: "correct-horse-42" }
    });
    const good = await call(base, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "login@example.com", password: "correct-horse-42" }
    });
    assert.equal(good.status, 200);
    assert.equal(good.json.user.email, "login@example.com");

    const bad = await call(base, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "login@example.com", password: "wrong-password-99" }
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error, "invalid_credentials");

    const missing = await call(base, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "nobody@example.com", password: "wrong-password-99" }
    });
    assert.equal(missing.status, 401);
    assert.deepEqual(missing.json, bad.json);
  });
  await pool.end();
});

test("session restoration, logout invalidation, and protected endpoint", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    const anonymous = await call(base, "/api/v1/account", { headers: { "x-user-id": randomUUID() } });
    assert.equal(anonymous.status, 401);

    const registered = await call(base, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "session@example.com", password: "correct-horse-42", role: "admin" }
    });
    const cookie = cookieOf(registered);

    const me = await call(base, "/api/v1/auth/me", { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, "session@example.com");
    assert.equal(me.json.user.role, "user");

    const account = await call(base, "/api/v1/account", {
      cookie,
      headers: { "x-user-id": randomUUID(), "x-user-role": "admin" }
    });
    assert.equal(account.status, 200);
    assert.equal(account.json.user.email, "session@example.com");
    assert.equal(account.json.user.role, "user");

    const logout = await call(base, "/api/v1/auth/logout", { method: "POST", cookie });
    assert.equal(logout.status, 200);
    const after = await call(base, "/api/v1/auth/me", { cookie });
    assert.equal(after.status, 401);

    const sessionHash = hashToken(cookie.replace(`${COOKIE_NAME}=`, ""));
    const revoked = await pool.query("SELECT revoked_at FROM auth_sessions WHERE id = $1", [sessionHash]);
    assert.ok(revoked.rows[0].revoked_at);
  });
  await pool.end();
});

test("email verification updates persisted status", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    const registered = await call(base, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "verify@example.com", password: "correct-horse-42" }
    });
    const verified = await call(base, "/api/v1/auth/verify-email", {
      method: "POST",
      body: { token: registered.json.devVerificationToken }
    });
    assert.equal(verified.status, 200);
    const me = await call(base, "/api/v1/auth/me", { cookie: cookieOf(registered) });
    assert.equal(me.json.user.emailVerified, true);

    const reused = await call(base, "/api/v1/auth/verify-email", {
      method: "POST",
      body: { token: registered.json.devVerificationToken }
    });
    assert.equal(reused.status, 400);
  });
  await pool.end();
});

test("login rate limiting rejects brute force", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    await call(base, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "ratelimit@example.com", password: "correct-horse-42" }
    });
    for (let i = 0; i < 8; i += 1) {
      const attempt = await call(base, "/api/v1/auth/login", {
        method: "POST",
        body: { email: "ratelimit@example.com", password: `wrong-password-${i}` }
      });
      assert.equal(attempt.status, 401);
    }
    const blocked = await call(base, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "ratelimit@example.com", password: "correct-horse-42" }
    });
    assert.equal(blocked.status, 429);
  });
  await pool.end();
});

test("CORS allows credentials only for configured origin", async () => {
  const { pool } = makeDatabase();
  const app = createApp({ pool });
  await withServer(app, async (base) => {
    const allowed = await call(base, "/health/live");
    assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

    const denied = await fetch(`${base}/health/live`, { headers: { Origin: "https://evil.example.com" } });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  });
  await pool.end();
});
