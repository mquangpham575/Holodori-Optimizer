import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cdnMediaUrl,
  ffmpegAvailable,
  isMediaAssetId,
  MediaMirror,
  parseByteRange,
  transcodeAnimation,
  type MediaKind,
  type MediaStore,
} from "../src/etl/card-media.ts";

const BASE = "https://cdn.example.test";
const ID = "00017-5-uniq-0015-00";

// A tiny buffer that looks like an MP4 (the size box, then "ftyp").
const mp4 = (size: number) => {
  const b = Buffer.alloc(size, 1);
  b.write("ftyp", 4, "latin1");
  return b;
};

const memoryStore = () => {
  const files = new Map<string, Buffer>();
  const store: MediaStore = {
    async has(kind, id) { return files.has(`${kind}:${id}`); },
    async save(kind, id, data) { files.set(`${kind}:${id}`, data); },
    async totalBytes() { return [...files.values()].reduce((n, b) => n + b.length, 0); },
  };
  return { store, files };
};

const fakeCdn = (bodies: Record<string, Buffer | number>) => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const body = bodies[url];
    if (typeof body === "number") return new Response(null, { status: body });
    if (!body) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

test("CDN URLs follow the <name>.usm/<name>/<name>.<ext> layout and ids are checked", () => {
  assert.equal(
    cdnMediaUrl("anim", ID, `${BASE}/`),
    `${BASE}/assets/resources/mov_card_full_0_${ID}.usm/mov_card_full_0_${ID}/mov_card_full_0_${ID}.mp4`
  );
  assert.equal(
    cdnMediaUrl("sign", ID, BASE),
    `${BASE}/assets/resources/mov_card_sign_${ID}.usm/mov_card_sign_${ID}/mov_card_sign_${ID}.h264.mp4`
  );
  assert.ok(isMediaAssetId(ID));
  for (const bad of ["00001-4-cmmn-0000-00", "../../etc/passwd", `${ID}/x`, "", "00017-5-uniq-15-00"]) {
    assert.equal(isMediaAssetId(bad), false, bad);
  }
});

test("byte ranges: open-ended, bounded, suffix, clamped, and unsatisfiable", () => {
  assert.equal(parseByteRange(undefined, 100), null);
  assert.equal(parseByteRange("items=0-5", 100), null);
  assert.deepEqual(parseByteRange("bytes=0-", 100), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseByteRange("bytes=100-", 100), "unsatisfiable");
  assert.equal(parseByteRange("bytes=20-10", 100), "unsatisfiable");
});

test("the mirror stores a shrunk animation and the signature as it is, once", async () => {
  const { store, files } = memoryStore();
  const anim = mp4(3000);
  const sign = mp4(500);
  const cdn = fakeCdn({ [cdnMediaUrl("anim", ID, BASE)]: anim, [cdnMediaUrl("sign", ID, BASE)]: sign });
  const mirror = new MediaMirror({ store, base: BASE, maxBytes: 1e6, fetchImpl: cdn.fetchImpl, transcode: async () => mp4(1000) });
  assert.equal(mirror.enqueue("anim", ID), true);
  assert.equal(mirror.enqueue("anim", ID), false, "already queued");
  assert.equal(mirror.enqueue("sign", ID), true);
  await mirror.idle();
  assert.equal(files.get(`anim:${ID}`)?.length, 1000);
  assert.deepEqual(files.get(`sign:${ID}`), sign);
  // Stored: no second download.
  mirror.enqueue("anim", ID);
  await mirror.idle();
  assert.equal(cdn.calls.length, 2);
});

test("an encode that does not shrink the file keeps the original", async () => {
  const { store, files } = memoryStore();
  const anim = mp4(800);
  const cdn = fakeCdn({ [cdnMediaUrl("anim", ID, BASE)]: anim });
  const mirror = new MediaMirror({ store, base: BASE, maxBytes: 1e6, fetchImpl: cdn.fetchImpl, transcode: async () => mp4(2000) });
  mirror.enqueue("anim", ID);
  await mirror.idle();
  assert.deepEqual(files.get(`anim:${ID}`), anim);
});

test("without an encoder animations are skipped, unknown ids never queued", async () => {
  const { store } = memoryStore();
  const cdn = fakeCdn({});
  const mirror = new MediaMirror({ store, base: BASE, maxBytes: 1e6, fetchImpl: cdn.fetchImpl, transcode: null });
  assert.equal(mirror.enqueue("anim", ID), false);
  assert.equal(mirror.enqueue("sign", "not-an-id"), false);
  assert.equal(mirror.enqueue("sign", "00001-4-cmmn-0000-00"), false);
  assert.equal(cdn.calls.length, 0);
});

test("failures are not retried right away, and HTML or oversized replies are never stored", async () => {
  const { store, files } = memoryStore();
  const kinds: MediaKind[] = ["anim", "sign"];
  const html = Buffer.from("<html>not a video</html>");
  const cdn = fakeCdn({ [cdnMediaUrl("sign", ID, BASE)]: html, [cdnMediaUrl("anim", ID, BASE)]: 500 });
  const mirror = new MediaMirror({ store, base: BASE, maxBytes: 1e6, fetchImpl: cdn.fetchImpl, transcode: async (b) => b });
  for (const kind of kinds) mirror.enqueue(kind, ID);
  await mirror.idle();
  assert.equal(files.size, 0);
  for (const kind of kinds) assert.equal(mirror.enqueue(kind, ID), false, `${kind} cooling down`);
  assert.equal(cdn.calls.length, 2);
});

test("the store cap stops further downloads", async () => {
  const { store, files } = memoryStore();
  await store.save("sign", "existing", mp4(600));
  const cdn = fakeCdn({ [cdnMediaUrl("sign", ID, BASE)]: mp4(100) });
  const mirror = new MediaMirror({ store, base: BASE, maxBytes: 500, fetchImpl: cdn.fetchImpl, transcode: async (b) => b });
  mirror.enqueue("sign", ID);
  await mirror.idle();
  assert.equal(files.has(`sign:${ID}`), false);
  assert.equal(cdn.calls.length, 0);
});

test("the queue is bounded", () => {
  const { store } = memoryStore();
  const cdn = fakeCdn({});
  const mirror = new MediaMirror({ store, base: BASE, maxBytes: 1e6, fetchImpl: cdn.fetchImpl, transcode: async (b) => b, maxQueue: 2 });
  const ids = ["00001-5-uniq-0001-00", "00002-5-uniq-0001-00", "00003-5-uniq-0001-00", "00004-5-uniq-0001-00"];
  const accepted = ids.map((id) => mirror.enqueue("sign", id));
  // The first job leaves the queue at once (it is running), so two more fit behind it.
  assert.deepEqual(accepted, [true, true, true, false]);
});

test("ffmpeg shrinks a real video and puts the index first", async (t) => {
  if (!(await ffmpegAvailable("ffmpeg"))) return t.skip("ffmpeg is not installed");
  const dir = mkdtempSync(join(tmpdir(), "holodreams-ffmpeg-test-"));
  try {
    const src = join(dir, "src.mp4");
    // Noisy test pattern at a generous bitrate, like the CDN's own files.
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-t", "2",
      "-c:v", "libx264", "-b:v", "6M", "-pix_fmt", "yuv420p", src,
    ]);
    const input = readFileSync(src);
    const output = await transcodeAnimation(input, "ffmpeg");
    assert.ok(output.length < input.length, `${output.length} < ${input.length}`);
    assert.equal(output.subarray(4, 8).toString("latin1"), "ftyp");
    assert.ok(output.indexOf("moov") < output.indexOf("mdat"), "faststart: index before data");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
