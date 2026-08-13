import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Integration tests against the real Express app using the JSON-file store.
// Runs on an ephemeral port with an isolated copy of database.json so writes
// never touch the working data.

let base;
let server;
let tempDir;

const api = async (path, { method = "GET", headers = {}, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  if (res.headers.get("content-type")?.includes("application/json")) {
    json = await res.json();
  }
  return { status: res.status, json };
};

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "holodreams-test-"));
  const dbPath = join(tempDir, "database.json");
  cpSync("backend/database.json", dbPath);
  process.env.DB_PATH = dbPath;

  const { createApp } = await import("../src/app.js");
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("GET /api/health returns operational", async () => {
  const { status, json } = await api("/api/health");
  assert.equal(status, 200);
  assert.equal(json.status, "operational");
  assert.equal(json.services.backend, "operational");
});

test("GET /api/characters returns the seeded roster", async () => {
  const { status, json } = await api("/api/characters");
  assert.equal(status, 200);
  assert.ok(json.length >= 50, "expected a populated character roster");
  assert.ok(json.every((c) => c.id && c.name && c.skills), "characters have core fields");
});

test("GET /api/characters/search finds a member by name", async () => {
  const { status, json } = await api("/api/characters/search?q=okayu");
  assert.equal(status, 200);
  assert.ok(json.some((c) => /okayu/i.test(c.name)), "search returned Nekomata Okayu");
});

test("GET /api/songs and /api/guides return data", async () => {
  const songs = await api("/api/songs");
  assert.equal(songs.status, 200);
  assert.ok(Array.isArray(songs.json));

  const guides = await api("/api/guides");
  assert.equal(guides.status, 200);
  assert.ok(Array.isArray(guides.json));
});

test("presets round-trip per device", async () => {
  const device = "test-device-a1b2";
  const headers = { "x-device-id": device };

  const get = await api("/api/presets", { headers });
  assert.equal(get.status, 200);
  assert.equal(get.json.length, 5);

  const updated = get.json.map((p) =>
    p.id === "preset_1"
      ? { ...p, team: ["azki", null, null, null, null], leader: "azki" }
      : p
  );
  const put = await api("/api/presets", { method: "PUT", headers, body: updated });
  assert.equal(put.status, 200);

  const again = await api("/api/presets", { headers });
  const preset1 = again.json.find((p) => p.id === "preset_1");
  assert.equal(preset1.leader, "azki");
});

test("PUT /api/presets rejects a non-array body", async () => {
  const { status } = await api("/api/presets", {
    method: "PUT",
    headers: { "x-device-id": "x" },
    body: { not: "an array" },
  });
  assert.equal(status, 400);
});

test("roster round-trip per device", async () => {
  const device = "test-device-roster";
  const headers = { "x-device-id": device };

  const put = await api("/api/roster", {
    method: "PUT",
    headers,
    body: ["azki", "robocosan"],
  });
  assert.equal(put.status, 200);

  const get = await api("/api/roster", { headers });
  assert.equal(get.status, 200);
  assert.deepEqual(get.json, ["azki", "robocosan"]);
});

test("admin login issues a token, admin routes require it", async () => {
  // No token -> 401
  const noAuth = await api("/api/admin/characters", { method: "POST", body: {} });
  assert.equal(noAuth.status, 401);

  // Garbage bearer -> 401
  const badToken = await api("/api/admin/characters", {
    method: "POST",
    headers: { authorization: "Bearer not-a-real-token" },
    body: {},
  });
  assert.equal(badToken.status, 401);

  // Wrong password -> 401
  const badLogin = await api("/api/admin/login", {
    method: "POST",
    body: { password: "wrong" },
  });
  assert.equal(badLogin.status, 401);

  // Correct password -> token
  const login = await api("/api/admin/login", {
    method: "POST",
    body: { password: "admin123" },
  });
  assert.equal(login.status, 200);
  assert.ok(login.json.token, "login returns a token");

  // Token works; missing required fields -> 400 (auth passed)
  const authed = await api("/api/admin/characters", {
    method: "POST",
    headers: { authorization: `Bearer ${login.json.token}` },
    body: {},
  });
  assert.equal(authed.status, 400);
});

test("unknown routes return 404 JSON", async () => {
  const { status } = await api("/api/does-not-exist");
  assert.equal(status, 404);
});
