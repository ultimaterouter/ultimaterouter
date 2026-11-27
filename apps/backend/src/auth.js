import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

const COOKIE_NAME = "ur_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 4);

const GENERIC_LOGIN_ERROR = {
  error: "invalid_credentials",
  message: "Unable to sign in with those details."
};
const GENERIC_REGISTER_ERROR = {
  error: "registration_failed",
  message: "Unable to register with those details."
};

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header = "") {
  return header.split(";").reduce((result, part) => {
    const index = part.indexOf("=");
    if (index < 0) return result;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
    return result;
  }, {});
}

function cookieOptions(isProduction) {
  // Cross-site: workers.dev -> railway.app. Production cookies must be Secure
  // and SameSite=None; local development uses SameSite=Lax over HTTP.
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/"
  };
}

function safeUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: Boolean(row.email_verified),
    role: row.role,
    createdAt: row.created_at
  };
}

async function loadSessionUser(req, dbPool) {
  const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!raw) return null;
  const result = await dbPool.query(
    `SELECT u.id, u.email, u.display_name, u.email_verified, u.role, u.created_at
     FROM auth_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [hashToken(raw)]
  );
  return result.rowCount ? result.rows[0] : null;
}

function createLimiter() {
  const buckets = new Map();
  const check = (key, limit, windowMs) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now - current.start >= windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  };
  check.reset = () => buckets.clear();
  return check;
}

const emailField = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const registerSchema = z.object({
  email: emailField,
  password: z.string().min(10, "Password must be at least 10 characters").max(200)
    .regex(/[A-Za-z]/).regex(/[0-9]/),
  displayName: z.string().trim().min(1).max(80).optional()
}).passthrough();
const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(200)
}).passthrough();
const tokenSchema = z.object({ token: z.string().min(16).max(200) }).passthrough();

export function registerAuthRoutes(app, dbPool, allowedOrigins, isProduction) {
  const limiter = createLimiter();
  app.locals.__resetAuthRateLimits = () => limiter.reset?.();

  const rateLimit = (name, limit, windowMs) => (req, res, next) => {
    const key = `${name}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    if (!limiter(key, limit, windowMs)) {
      return res.status(429).json({ error: "too_many_requests" });
    }
    next();
  };

  const originGuard = (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin.replace(/\/$/, ""))) {
      return res.status(403).json({ error: "forbidden_origin" });
    }
    next();
  };

  // Browsers always add this header in our client. It blocks simple cross-site
  // form posts, complementing the exact-origin CORS allowlist.
  const requestedWithGuard = (req, res, next) => {
    if (req.headers["x-requested-with"] !== "XMLHttpRequest") {
      return res.status(400).json({ error: "invalid_request" });
    }
    next();
  };

  async function createSession(res, userId) {
    const token = randomBytes(32).toString("hex");
    await dbPool.query(
      "INSERT INTO auth_sessions(id, user_id, expires_at) VALUES ($1, $2, $3)",
      [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)]
    );
    res.cookie(COOKIE_NAME, token, {
      ...cookieOptions(isProduction),
      maxAge: SESSION_TTL_MS
    });
    return token;
  }

  async function requireAuth(req, res, next) {
    try {
      const user = await loadSessionUser(req, dbPool);
      if (!user) return res.status(401).json({ error: "authentication_required" });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: "authentication_required" });
    }
  }

  app.post(
    "/api/v1/auth/register",
    originGuard,
    requestedWithGuard,
    rateLimit("register", 5, 15 * 60 * 1000),
    async (req, res, next) => {
      try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        }
        const { email, password } = parsed.data;
        const displayName = parsed.data.displayName || email.split("@")[0];

        const existing = await dbPool.query(
          "SELECT 1 FROM app_users WHERE email_normalized = $1",
          [email]
        );
        if (existing.rowCount) return res.status(409).json(GENERIC_REGISTER_ERROR);

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const id = randomUUID();
        let inserted;
        try {
          inserted = await dbPool.query(
            `INSERT INTO app_users(id, email, email_normalized, password_hash, display_name, role, email_verified)
             VALUES ($1, $2, $2, $3, $4, 'user', FALSE)
             RETURNING id, email, display_name, email_verified, role, created_at`,
            [id, email, passwordHash, displayName]
          );
        } catch (error) {
          // Unique violation must not reveal which account already exists.
          if (error?.code === "23505") return res.status(409).json(GENERIC_REGISTER_ERROR);
          throw error;
        }

        const verificationToken = randomBytes(32).toString("hex");
        await dbPool.query(
          `INSERT INTO email_verification_tokens(token_hash, user_id, expires_at)
           VALUES ($1, $2, $3)`,
          [hashToken(verificationToken), id, new Date(Date.now() + VERIFICATION_TTL_MS)]
        );
        await createSession(res, id);

        const payload = { user: safeUser(inserted.rows[0]) };
        // Token is exposed only outside production because no email provider is configured yet.
        if (!isProduction) payload.devVerificationToken = verificationToken;
        return res.status(201).json(payload);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/v1/auth/login",
    originGuard,
    requestedWithGuard,
    rateLimit("login", 8, 15 * 60 * 1000),
    async (req, res, next) => {
      try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) return res.status(401).json(GENERIC_LOGIN_ERROR);
        const { email, password } = parsed.data;

        const result = await dbPool.query(
          `SELECT id, email, password_hash, display_name, email_verified, role, created_at
           FROM app_users WHERE email_normalized = $1`,
          [email]
        );
        const user = result.rowCount ? result.rows[0] : null;
        const storedHash = user?.password_hash || DUMMY_HASH;
        const valid = await bcrypt.compare(password, storedHash);
        if (!user || !valid) return res.status(401).json(GENERIC_LOGIN_ERROR);

        await createSession(res, user.id);
        return res.json({ user: safeUser(user) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/v1/auth/logout",
    originGuard,
    requestedWithGuard,
    async (req, res, next) => {
      try {
        const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
        if (raw) {
          await dbPool.query(
            "UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1",
            [hashToken(raw)]
          );
        }
        res.clearCookie(COOKIE_NAME, cookieOptions(isProduction));
        return res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/v1/auth/me", originGuard, async (req, res, next) => {
    try {
      const user = await loadSessionUser(req, dbPool);
      if (!user) return res.status(401).json({ error: "invalid_session" });
      return res.json({ user: safeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/v1/auth/verify-email",
    originGuard,
    requestedWithGuard,
    rateLimit("verify", 10, 15 * 60 * 1000),
    async (req, res, next) => {
      try {
        const parsed = tokenSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "invalid_token", message: "Verification link is invalid or expired." });
        }
        const client = await dbPool.connect();
        try {
          await client.query("BEGIN");
          const result = await client.query(
            `UPDATE email_verification_tokens SET used_at = NOW()
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
             RETURNING user_id`,
            [hashToken(parsed.data.token)]
          );
          if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "invalid_token", message: "Verification link is invalid or expired." });
          }
          await client.query(
            "UPDATE app_users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1",
            [result.rows[0].user_id]
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
        return res.json({ ok: true, emailVerified: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/v1/auth/resend-verification",
    originGuard,
    requestedWithGuard,
    rateLimit("resend", 5, 60 * 60 * 1000),
    async (req, res, next) => {
      try {
        const user = await loadSessionUser(req, dbPool);
        if (user) {
          const token = randomBytes(32).toString("hex");
          await dbPool.query(
            `INSERT INTO email_verification_tokens(token_hash, user_id, expires_at)
             VALUES ($1, $2, $3)`,
            [hashToken(token), user.id, new Date(Date.now() + VERIFICATION_TTL_MS)]
          );
          // Email delivery is intentionally not faked. Configure the provider
          // in Railway before relying on this endpoint for real users.
          if (!isProduction) return res.status(202).json({ accepted: true, devVerificationToken: token });
        }
        // Always generic: anonymous callers cannot enumerate accounts.
        return res.status(202).json({ accepted: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/v1/account", originGuard, requireAuth, (req, res) => {
    // Identity comes only from the verified session, never from headers/body.
    res.json({ user: safeUser(req.user) });
  });

  return { requireAuth };
}

export { COOKIE_NAME, hashToken, safeUser };
