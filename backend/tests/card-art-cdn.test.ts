import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  fullArtUrl,
  fetchFullArt,
  syncFullArt,
  RECHECK_MS,
  THUMB_WIDTH,
  SQUARE_SIZE,
  makeSquare,
  type FullArtStore,
} from "../src/etl/card-art-cdn.ts";

const BASE = "https://cdn.example.test";
const ID = "00017-5-uniq-0015-00";

const bigWebp = () =>
  sharp({ create: { width: 1820, height: 1024, channels: 3, background: "#3366cc" } }).webp().toBuffer();

// The Response constructor refuses "null body" statuses such as 304, so fake it.
const reply = (status: number, body?: Buffer, headers: Record<string, string> = {}): Response =>
  status === 304
    ? ({ status, ok: false, headers: new Headers(headers) } as unknown as Response)
    : new Response(body ? new Uint8Array(body) : null, { status, headers });

test("URLs are built from the asset id only, and unsafe input is rejected", () => {
  assert.equal(
    fullArtUrl(BASE, ID),
    `${BASE}/assets/assetbundles/img_card_full_${ID}/img_card_full_${ID}_unsquished.webp`
  );
  assert.throws(() => fullArtUrl(BASE, "../etc/passwd"));
  assert.throws(() => fullArtUrl(BASE, "a b"));
  assert.throws(() => fullArtUrl("http://cdn.example.test", ID), /https/);
  assert.throws(() => fullArtUrl("https://cdn.example.test/../x", ID), /https/);
});

test("fetchFullArt returns the original plus a grid-size thumbnail", async () => {
  const src = await bigWebp();
  let seen: { url: string; headers: any } | null = null;
  const fetchImpl = (async (url: any, init: any) => {
    seen = { url: String(url), headers: init.headers };
    return reply(200, src, { etag: '"abc"', "content-length": String(src.length) });
  }) as typeof fetch;
  const r = await fetchFullArt(ID, { base: BASE, fetchImpl, etag: '"old"' });
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.etag, '"abc"');
  assert.deepEqual(r.full, src);
  const meta = await sharp(r.thumb).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, THUMB_WIDTH);
  assert.ok(r.thumb.length < src.length);
  assert.equal(seen!.headers["If-None-Match"], '"old"');
  // ...and a square icon, so the small frames never have to stretch a 16:9 picture.
  const sq = await sharp(r.square!).metadata();
  assert.deepEqual([sq.format, sq.width, sq.height], ["webp", SQUARE_SIZE, SQUARE_SIZE]);
});

test("the square icon keeps the picture's proportions instead of squeezing it", async () => {
  // 1820x1024: a red disc on the right of a blue field. A stretched copy would shrink the
  // disc horizontally; a crop keeps it round and still contains it.
  const w = 1820, h = 1024, cx = 1300, cy = 512, rad = 300;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 < rad ** 2;
      raw[i] = inside ? 230 : 20;
      raw[i + 1] = inside ? 20 : 40;
      raw[i + 2] = inside ? 20 : 200;
    }
  }
  const src = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).webp().toBuffer();
  const icon = await makeSquare(src);
  assert.ok(icon);
  const { data, info } = await sharp(icon!).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 150 && data[i + 2] < 100) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  const dw = maxX - minX + 1, dh = maxY - minY + 1;
  assert.ok(dw > 50 && dh > 50, "the subject is in the icon");
  assert.ok(Math.abs(dw / dh - 1) < 0.1, `subject is still round (${dw}x${dh})`);
});

test("fetchFullArt handles 304, 404 and rejects non-WebP bodies", async () => {
  const mk = (res: () => Response) => ((async () => res()) as unknown as typeof fetch);
  assert.deepEqual(await fetchFullArt(ID, { base: BASE, fetchImpl: mk(() => reply(304)) }), { status: "unchanged" });
  assert.deepEqual(await fetchFullArt(ID, { base: BASE, fetchImpl: mk(() => reply(404)) }), { status: "missing" });
  await assert.rejects(
    fetchFullArt(ID, { base: BASE, fetchImpl: mk(() => reply(200, Buffer.from("<html>nope</html>"))) }),
    /not a WebP/
  );
  await assert.rejects(fetchFullArt(ID, { base: BASE, fetchImpl: mk(() => reply(500)) }), /500/);
});

const memoryStore = (initial: Record<string, { etag: string | null; checkedAt: number }> = {}) => {
  const rows = new Map(Object.entries(initial));
  const saved: string[] = [];
  const touched: string[] = [];
  const store: FullArtStore = {
    known: async () => new Map(rows),
    save: async (id, art) => {
      saved.push(id);
      rows.set(id, { etag: art.etag, checkedAt: Date.now() });
    },
    touch: async (id) => {
      touched.push(id);
    },
  };
  return { store, saved, touched };
};

test("sync downloads new cards, revalidates stale ones and skips fresh ones", async () => {
  const src = await bigWebp();
  const now = Date.now();
  const { store, saved, touched } = memoryStore({
    fresh: { etag: '"f"', checkedAt: now - 1000 },
    stale: { etag: '"s"', checkedAt: now - RECHECK_MS - 1000 },
  });
  const calls: string[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("img_card_full_stale_")) return reply(init.headers["If-None-Match"] === '"s"' ? 304 : 200, src);
    if (u.includes("img_card_full_gone_")) return reply(404);
    return reply(200, src, { etag: '"n"' });
  }) as typeof fetch;

  const r = await syncFullArt(["fresh", "stale", "brand-new", "gone"], store, { base: BASE, fetchImpl, now });
  assert.deepEqual(saved, ["brand-new"]);
  assert.deepEqual(touched, ["stale"]);
  assert.deepEqual(r.missing, ["gone"]);
  assert.equal(r.saved, 1);
  assert.equal(r.unchanged, 2, "fresh + 304");
  assert.equal(calls.some((u) => u.includes("img_card_full_fresh_")), false, "fresh entries cost no request");
});

test("sync stops hammering a CDN that is down", async () => {
  const { store } = memoryStore();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return reply(503);
  }) as unknown as typeof fetch;
  const ids = Array.from({ length: 40 }, (_, i) => `card-${String(i).padStart(3, "0")}`);
  const r = await syncFullArt(ids, store, { base: BASE, fetchImpl, concurrency: 1 });
  assert.ok(calls <= 6, `stopped early (${calls} calls)`);
  assert.ok(r.failed >= 5);
  assert.equal(r.saved, 0);
});

test("sync cuts icons for cards that were mirrored before icons existed, without downloading again", async () => {
  const src = await bigWebp();
  const icons = new Map<string, Buffer>();
  const store: FullArtStore = {
    known: async () => new Map([["old-card", { etag: '"o"', checkedAt: Date.now() }]]),
    save: async () => {},
    touch: async () => {},
    missingSquare: async () => ["old-card", "no-original"].filter((id) => !icons.has(id)),
    loadFull: async (id) => (id === "old-card" ? src : null),
    saveSquare: async (id, sq) => {
      icons.set(id, sq);
    },
  };
  const fetchImpl = (async () => {
    throw new Error("must not download");
  }) as unknown as typeof fetch;
  const r = await syncFullArt(["old-card"], store, { base: BASE, fetchImpl });
  assert.equal(r.squared, 1);
  assert.deepEqual([...icons.keys()], ["old-card"]);
  const meta = await sharp(icons.get("old-card")!).metadata();
  assert.equal(meta.width, SQUARE_SIZE);
  // a second run finds nothing left to do
  assert.equal((await syncFullArt(["old-card"], store, { base: BASE, fetchImpl })).squared, 0);
});
