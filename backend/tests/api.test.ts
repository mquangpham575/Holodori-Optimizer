import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Integration tests against the real Express app using the JSON-file store.
// Runs on an ephemeral port with an isolated copy of database.json so writes
// never touch the working data.

let base: string;
let server: any;
let tempDir: string;

const api = async (
  path: string,
  { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
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

  const { createApp } = await import("../src/app.ts");
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

test("versioned alias GET /api/v1/health works", async () => {
  const { status } = await api("/api/v1/health");
  assert.equal(status, 200);
});

test("GET /api/characters returns the seeded roster", async () => {
  const { status, json } = await api("/api/characters");
  assert.equal(status, 200);
  assert.ok(json.length >= 50, "expected a populated character roster");
  assert.ok(json.every((c: any) => c.id && c.name && c.skills), "characters have core fields");
});

test("GET /api/characters/search finds a member by name", async () => {
  const { status, json } = await api("/api/characters/search?q=okayu");
  assert.equal(status, 200);
  assert.ok(json.some((c: any) => /okayu/i.test(c.name)), "search returned Nekomata Okayu");
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

  const updated = get.json.map((p: any) =>
    p.id === "preset_1"
      ? { ...p, team: ["azki", null, null, null, null], leader: "azki" }
      : p
  );
  const put = await api("/api/presets", { method: "PUT", headers, body: updated });
  assert.equal(put.status, 200);

  const again = await api("/api/presets", { headers });
  const preset1 = again.json.find((p: any) => p.id === "preset_1");
  assert.equal(preset1.leader, "azki");
});

test("PUT /api/presets rejects a non-array body (zod)", async () => {
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

  // Token works; missing required fields -> 400 (auth + validation passed)
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

// ---------------------------------------------------------------------------
// Regression tests for the review fixes
// ---------------------------------------------------------------------------

const adminToken = async (): Promise<string> => {
  const login = await api("/api/admin/login", { method: "POST", body: { password: "admin123" } });
  assert.equal(login.status, 200);
  return login.json.token;
};

test("presets keep per-slot bloom/level/selected-card data across a save", async () => {
  const headers = { "x-device-id": "test-device-slots" };
  const presets = (await api("/api/presets", { headers })).json;
  const updated = presets.map((p: any) =>
    p.id === "preset_2"
      ? {
          ...p,
          team: ["azki", "robocosan", null, null, null],
          bloomLevels: [3, 1, 0, 0, 0],
          cardLevels: [80, 65, 70, 70, 70],
          selectedCards: ["azki-5-1", null, null, null, null],
        }
      : p
  );
  const put = await api("/api/presets", { method: "PUT", headers, body: updated });
  assert.equal(put.status, 200);

  const again = (await api("/api/presets", { headers })).json.find((p: any) => p.id === "preset_2");
  assert.deepEqual(again.bloomLevels, [3, 1, 0, 0, 0]);
  assert.deepEqual(again.cardLevels, [80, 65, 70, 70, 70]);
  assert.deepEqual(again.selectedCards, ["azki-5-1", null, null, null, null]);
});

test("roster accepts the {id, bloom, level} entries the team builder writes", async () => {
  const headers = { "x-device-id": "test-device-roster-objects" };
  const body = [{ id: "azki", bloom: 2, level: 75 }, "robocosan"];
  const put = await api("/api/roster", { method: "PUT", headers, body });
  assert.equal(put.status, 200);
  assert.deepEqual((await api("/api/roster", { headers })).json, body);

  const bad = await api("/api/roster", { method: "PUT", headers, body: [{ id: "azki", level: 999 }] });
  assert.equal(bad.status, 400);
});

test("unauthenticated endpoints reject oversized bodies (1 MB cap)", async () => {
  const huge = [{ id: "preset_1", name: "x".repeat(2 * 1024 * 1024), team: [null, null, null, null, null] }];
  const { status } = await api("/api/presets", {
    method: "PUT",
    headers: { "x-device-id": "test-device-big" },
    body: huge,
  });
  assert.equal(status, 413);
});

test("admin upload only accepts real images", async () => {
  const token = await adminToken();
  const headers = { authorization: `Bearer ${token}` };

  const html = Buffer.from("<script>alert(1)</script>").toString("base64");
  const badExt = await api("/api/admin/upload", {
    method: "POST",
    headers,
    body: { fileName: "evil.html", base64Data: html },
  });
  assert.equal(badExt.status, 400);

  const disguised = await api("/api/admin/upload", {
    method: "POST",
    headers,
    body: { fileName: "evil.png", base64Data: html },
  });
  assert.equal(disguised.status, 400);

  // 1x1 transparent PNG
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const ok = await api("/api/admin/upload", {
    method: "POST",
    headers,
    body: { fileName: "pixel.PNG", base64Data: `data:image/png;base64,${png}` },
  });
  assert.equal(ok.status, 200);
  assert.match(ok.json.url, /^\/images\/upload_\d+_[0-9a-f]{8}\.png$/);

  // Don't leave the file in the real images directory.
  const { default: config } = await import("../src/config.ts");
  const { unlinkSync } = await import("node:fs");
  unlinkSync(join(config.imagesDir, ok.json.url.replace("/images/", "")));
});

test("admin character update is partial, validated and 404s on unknown ids", async () => {
  const token = await adminToken();
  const headers = { authorization: `Bearer ${token}` };
  const before = (await api("/api/characters")).json[0];

  const put = await api(`/api/admin/characters/${before.id}`, {
    method: "PUT",
    headers,
    body: { id: "hijacked", title: "Renamed title" },
  });
  assert.equal(put.status, 200);

  const after = (await api("/api/characters")).json.find((c: any) => c.id === before.id);
  assert.equal(after.title, "Renamed title");
  assert.equal(after.name, before.name, "omitted fields are preserved");
  assert.ok(!(await api("/api/characters")).json.some((c: any) => c.id === "hijacked"), "id cannot be changed");

  const missing = await api("/api/admin/characters/nope-nope", { method: "PUT", headers, body: { title: "x" } });
  assert.equal(missing.status, 404);
});

test("extractPacked ignores braces inside string literals", async () => {
  const { extractPacked } = await import("../src/etl/holodori-sync.ts");
  const src = 'const BUNDLED_PACKED = {"a":"skill } text { with \\" braces","b":{"c":1}};\nconst next = 2;';
  assert.deepEqual(extractPacked(src), { a: 'skill } text { with " braces', b: { c: 1 } });
});

// ---------------------------------------------------------------------------
// Card art: portrait fallback + manual upload
// ---------------------------------------------------------------------------

test("/images/cards/<assetId>.webp never 404s for a catalogued card (image or portrait redirect)", async () => {
  const chars = (await api("/api/characters")).json;
  const assetId = chars.find((c: any) => Array.isArray(c.cards) && c.cards[0]?.assetId).cards[0].assetId;
  const res = await fetch(`${base}/images/cards/${assetId}.webp`, { redirect: "manual" });
  assert.ok(res.status === 200 || res.status === 302, `got ${res.status}`);
  if (res.status === 302) assert.match(res.headers.get("location") ?? "", /^\/images\/[A-Za-z0-9_-]+\.(webp|png|jpg)$/);

  const unknown = await fetch(`${base}/images/cards/zz-no-such-card.webp`, { redirect: "manual" });
  assert.equal(unknown.status, 404);
  const bad = await fetch(`${base}/images/cards/..%2Fetc.webp`);
  assert.ok(bad.status === 400 || bad.status === 404);
});

test("admin can upload WebP card art, and only WebP", async () => {
  const token = await adminToken();
  const headers = { authorization: `Bearer ${token}` };
  const webp = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
  const assetId = "zz-test-card-art-0001";

  const notWebp = await api("/api/admin/card-art", {
    method: "POST",
    headers,
    body: { assetId, base64Data: Buffer.from("<html>").toString("base64") },
  });
  assert.equal(notWebp.status, 400);
  const badId = await api("/api/admin/card-art", {
    method: "POST",
    headers,
    body: { assetId: "../../evil", base64Data: webp },
  });
  assert.equal(badId.status, 400);

  const ok = await api("/api/admin/card-art", { method: "POST", headers, body: { assetId, base64Data: webp } });
  assert.equal(ok.status, 200);
  const served = await fetch(`${base}/images/cards/${assetId}.webp`);
  assert.equal(served.status, 200);
  assert.match(served.headers.get("content-type") ?? "", /image\/webp/);

  const { default: config } = await import("../src/config.ts");
  const { unlinkSync } = await import("node:fs");
  unlinkSync(join(config.imagesDir, "cards", `${assetId}.webp`));
});
