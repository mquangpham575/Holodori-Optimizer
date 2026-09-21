/**
 * On-demand mirror of the 5-star card animation and signature videos.
 *
 * Streaming them straight from the art CDN is slow the first time a visitor opens a
 * card (about 2.6 MB for the animation, and the CDN does not cache at its edge). The
 * first request for a card that is not mirrored yet is redirected to the CDN, exactly
 * as before, and queues a background job that downloads it. The animation is
 * re-encoded to roughly a third of its size (ffmpeg; without ffmpeg it is not
 * mirrored), the signature is stored as it is. Every later request is served from our
 * own store with long cache headers, and only cards somebody actually opened are stored.
 * See NOTICE.md; CARD_MEDIA_MIRROR=false turns this off.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../logger.js";

export type MediaKind = "anim" | "sign";

// 5-star card asset ids look like 00017-5-uniq-0015-00 (member, rarity, kind, art, variant).
const ASSET_ID = /^\d{5}-5-[a-z0-9]+-\d{4}-\d{2}$/;
export const isMediaAssetId = (id: string): boolean => ASSET_ID.test(id);

/** Where a video lives on the CDN: <name>.usm/<name>/<name>.<ext>. */
export const cdnMediaUrl = (kind: MediaKind, assetId: string, base: string): string => {
  const name = `${kind === "anim" ? "mov_card_full_0_" : "mov_card_sign_"}${assetId}`;
  return `${base.replace(/\/+$/, "")}/assets/resources/${name}.usm/${name}/${name}.${kind === "anim" ? "mp4" : "h264.mp4"}`;
};

export interface MediaStore {
  has(kind: MediaKind, assetId: string): Promise<boolean>;
  save(kind: MediaKind, assetId: string, data: Buffer): Promise<void>;
  totalBytes(): Promise<number>;
}

// --- Transcoding ---------------------------------------------------------------

// 1280x720, no audio, CRF 28: about 0.9 MB instead of 2.6 MB with no visible loss on
// this artwork (SSIM 0.96). faststart puts the index first so playback starts at once.
const FFMPEG_ARGS = [
  "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
];

const run = (file: string, args: string[], timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });

export const ffmpegAvailable = async (ffmpegPath: string): Promise<boolean> => {
  try {
    await run(ffmpegPath, ["-version"], 10_000);
    return true;
  } catch {
    return false;
  }
};

export const transcodeAnimation = async (input: Buffer, ffmpegPath: string): Promise<Buffer> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "holodreams-media-"));
  try {
    const src = path.join(dir, "in.mp4");
    const out = path.join(dir, "out.mp4");
    fs.writeFileSync(src, input);
    await run(ffmpegPath, ["-v", "error", "-y", "-i", src, ...FFMPEG_ARGS, out], 180_000);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// --- The mirror ----------------------------------------------------------------

export interface MirrorOptions {
  store: MediaStore;
  base: string;
  maxBytes: number;
  fetchImpl?: typeof fetch;
  /** Re-encodes an animation; null = not possible (no ffmpeg), so it is not mirrored. */
  transcode?: ((input: Buffer) => Promise<Buffer>) | null;
  timeoutMs?: number;
  maxQueue?: number;
  /** How long a failed download is left alone. */
  retryAfterMs?: number;
}

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export class MediaMirror {
  private queue: Array<{ kind: MediaKind; assetId: string }> = [];
  private pending = new Set<string>();
  private failedUntil = new Map<string, number>();
  private running: Promise<void> | null = null;

  constructor(private readonly opts: MirrorOptions) {}

  private key = (kind: MediaKind, assetId: string) => `${kind}:${assetId}`;

  /** Queue a download. Returns false when it was not accepted (unknown id, already queued, failed recently, full queue, or nothing to encode with). */
  enqueue(kind: MediaKind, assetId: string): boolean {
    if (!isMediaAssetId(assetId)) return false;
    if (kind === "anim" && !this.opts.transcode) return false;
    const key = this.key(kind, assetId);
    if (this.pending.has(key)) return false;
    if ((this.failedUntil.get(key) ?? 0) > Date.now()) return false;
    if (this.queue.length >= (this.opts.maxQueue ?? 100)) return false;
    this.pending.add(key);
    this.queue.push({ kind, assetId });
    this.running ??= this.drain();
    return true;
  }

  /** Resolves when the queue is empty (used by tests). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    try {
      // One at a time: encoding is CPU-heavy and this runs next to the API.
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        const key = this.key(job.kind, job.assetId);
        try {
          await this.mirror(job.kind, job.assetId);
        } catch (err) {
          this.failedUntil.set(key, Date.now() + (this.opts.retryAfterMs ?? 60 * 60 * 1000));
          logger.warn({ err, kind: job.kind, assetId: job.assetId }, "Card media mirror failed");
        } finally {
          this.pending.delete(key);
        }
      }
    } finally {
      this.running = null;
    }
  }

  private async mirror(kind: MediaKind, assetId: string): Promise<void> {
    const { store, base, maxBytes } = this.opts;
    if (await store.has(kind, assetId)) return;
    if ((await store.totalBytes()) >= maxBytes) throw new Error("card media store is full (CARD_MEDIA_MAX_MB)");

    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(cdnMediaUrl(kind, assetId, base), { signal: AbortSignal.timeout(this.opts.timeoutMs ?? 60_000) });
    if (!res.ok) throw new Error(`CDN answered HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    if (original.length === 0 || original.length > MAX_DOWNLOAD_BYTES) throw new Error(`unexpected size ${original.length}`);
    // Anything that is not an MP4 (an HTML error page, say) is never stored.
    if (original.subarray(4, 8).toString("latin1") !== "ftyp") throw new Error("not an MP4 file");

    let data: Buffer = original;
    if (kind === "anim") {
      data = await this.opts.transcode!(original);
      // Never make things worse: keep the original if encoding did not shrink it.
      if (data.length >= original.length) data = original;
    }
    await store.save(kind, assetId, data);
    logger.info({ kind, assetId, from: original.length, to: data.length }, "Card media mirrored");
  }
}

// --- Range requests --------------------------------------------------------------

/** Parses a single "bytes=a-b" range. null = no/unsupported range (send it all); "unsatisfiable" = 416. */
export const parseByteRange = (header: string | undefined, size: number): { start: number; end: number } | null | "unsatisfiable" => {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]); // the last N bytes
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
};
