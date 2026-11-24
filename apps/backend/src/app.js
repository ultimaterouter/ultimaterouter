import express from "express";
import cors from "cors";
import { z } from "zod";
import { pool } from "./db/pool.js";

export function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";
  const configuredOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin && origin !== "*");
  // Local development keeps its previous default; production has no implicit origins.
  const allowedOrigins = configuredOrigins.length
    ? configuredOrigins
    : isProduction ? [] : ["http://localhost:5173"];

  app.disable("x-powered-by");
  app.use(cors({
    origin(origin, callback) {
      // Non-browser clients (including Railway healthchecks) send no Origin header.
      if (!origin) return callback(null, false);
      return callback(null, allowedOrigins.includes(origin.replace(/\/$/, "")));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));

  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ready", database: "connected" });
    } catch {
      res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  app.get("/api/v1", (_req, res) => {
    res.json({
      name: "Ultimate Router API",
      version: "0.1.0",
      status: "foundation",
      message: "Authentication and gateway features will be implemented in subsequent milestones."
    });
  });

  const echoSchema = z.object({ message: z.string().min(1).max(2000) });
  app.post("/api/v1/dev/validate", (req, res) => {
    const parsed = echoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    }
    return res.json({ valid: true, length: parsed.data.message.length });
  });

  app.use((err, _req, res, _next) => {
    // Log a non-sensitive code only: error messages can contain connection strings.
    console.error("Unhandled request error:", err?.code || err?.status || "unknown");
    res.status(500).json({ error: "server_error" });
  });

  return app;
}
