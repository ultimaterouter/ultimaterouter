import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

test("app factory returns an Express application", () => {
  const app = createApp();
  assert.equal(typeof app.listen, "function");
});

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

test("liveness check works without a database connection", async () => {
  await withServer(createApp(), async (base) => {
    const response = await fetch(`${base}/health/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("CORS allowlist accepts only configured production origins", async () => {
  const previous = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = "https://app.example.com, https://staging.example.com";
  try {
    await withServer(createApp(), async (base) => {
      const allowed = await fetch(`${base}/health/live`, {
        headers: { Origin: "https://app.example.com" }
      });
      assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");

      const denied = await fetch(`${base}/health/live`, {
        headers: { Origin: "https://evil.example.com" }
      });
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
    });
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  }
});
