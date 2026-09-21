/**
 * Mirrors the full card illustrations ("img_card_full_<assetId>_unsquished.webp",
 * ~1820x1024) from a CDN into our own store.
 *
 * Why mirror instead of hot-linking: the pages show up to 185 of these at once, so
 * linking would send every visitor's traffic to a community-run CDN. We download each
 * card once, keep the original for the detail view plus a small thumbnail for the
 * grid, and only re-check (conditional GET, usually a 304) once a week.
 *
 * The CDN serves these by name; the `?hash=` query the game manifest carries is only
 * a cache-buster, so it is not needed (and not available in the HolodoriDB tables).
 */
import config from "../config.js";
import { logger } from "../logger.js";

export const THUMB_WIDTH = 640;
// Square icon for the roster / team builder, which show cards in small frames. The
// illustrations are 16:9, so squeezing them into a frame would distort them; instead
// we cut a full-height square, centred on whatever sharp finds most salient (the
// character), so the whole figure stays in view.
export const SQUARE_SIZE = 256;
export const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const ASSET_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

export const fullArtUrl = (base: string, assetId: string): string => {
  if (!ASSET_ID_RE.test(assetId)) throw new Error(`invalid card asset id: ${assetId}`);
  const root = base.replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(root)) throw new Error("card art CDN base must be a plain https origin");
  return `${root}/assets/assetbundles/img_card_full_${assetId}/img_card_full_${assetId}_unsquished.webp`;
};

const isWebp = (b: Buffer): boolean =>
  b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";

let sharpPromise: Promise<any | null> | null = null;
const loadSharp = (): Promise<any | null> =>
  (sharpPromise ??= import("sharp")
    .then((m: any) => m.default ?? m)
    .catch((err) => {
      logger.warn({ err }, "sharp is unavailable; card thumbnails will be full size");
      return null;
    }));

export const makeThumbnail = async (input: Buffer): Promise<Buffer> => {
  const sharp = await loadSharp();
  if (!sharp) return input;
  return sharp(input).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
};

/** null when sharp is not available (the icon is then simply not generated). */
export const makeSquare = async (input: Buffer): Promise<Buffer | null> => {
  const sharp = await loadSharp();
  if (!sharp) return null;
  return sharp(input)
    .resize(SQUARE_SIZE, SQUARE_SIZE, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 82 })
    .toBuffer();
};

export type FullArtResult =
  | { status: "unchanged" }
  | { status: "missing" }
  | { status: "ok"; etag: string | null; full: Buffer; thumb: Buffer; square: Buffer | null };

export interface FetchOptions {
  base?: string;
  etag?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  thumbnail?: (input: Buffer) => Promise<Buffer>;
  square?: (input: Buffer) => Promise<Buffer | null>;
}

export async function fetchFullArt(assetId: string, opts: FetchOptions = {}): Promise<FullArtResult> {
  const { base = config.cardArtCdnBase, etag = null, fetchImpl = fetch, timeoutMs = 60_000, thumbnail = makeThumbnail, square = makeSquare } = opts;
  const url = fullArtUrl(base, assetId);
  const res = await fetchImpl(url, {
    headers: etag ? { "If-None-Match": etag } : {},
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 304) return { status: "unchanged" };
  if (res.status === 404 || res.status === 403) return { status: "missing" };
  if (!res.ok) throw new Error(`card art CDN answered ${res.status} for ${assetId}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Error(`card art for ${assetId} is too large (${declared} bytes)`);
  const full = Buffer.from(await res.arrayBuffer());
  if (full.length > MAX_BYTES) throw new Error(`card art for ${assetId} is too large (${full.length} bytes)`);
  if (!isWebp(full)) throw new Error(`card art for ${assetId} is not a WebP image`);
  return { status: "ok", etag: res.headers.get("etag"), full, thumb: await thumbnail(full), square: await square(full) };
}

export interface FullArtStore {
  /** What is already stored: id -> ETag it was fetched with and when it was last checked. */
  known(): Promise<Map<string, { etag: string | null; checkedAt: number }>>;
  save(assetId: string, art: { full: Buffer; thumb: Buffer; square: Buffer | null; etag: string | null }): Promise<void>;
  touch(assetId: string): Promise<void>;
  // Cards mirrored before square icons existed (or while sharp was unavailable) get
  // theirs made from the stored original, without another download.
  missingSquare?(): Promise<string[]>;
  loadFull?(assetId: string): Promise<Buffer | null>;
  saveSquare?(assetId: string, square: Buffer): Promise<void>;
}

export interface SyncSummary {
  saved: number;
  squared: number;
  unchanged: number;
  missing: string[];
  failed: number;
}

/** Downloads missing card illustrations and revalidates stale ones, a few at a time. */
export async function syncFullArt(
  assetIds: string[],
  store: FullArtStore,
  opts: { now?: number; concurrency?: number } & FetchOptions = {}
): Promise<SyncSummary> {
  const { now = Date.now(), concurrency = 3, ...fetchOpts } = opts;
  const known = await store.known();
  const summary: SyncSummary = { saved: 0, squared: 0, unchanged: 0, missing: [], failed: 0 };
  const queue = [...new Set(assetIds)].filter((id) => {
    const k = known.get(id);
    if (k && now - k.checkedAt < RECHECK_MS) {
      summary.unchanged++;
      return false;
    }
    return true;
  });

  let consecutiveFailures = 0;
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (consecutiveFailures >= 5) return; // CDN is down: stop instead of hammering it
      try {
        const r = await fetchFullArt(id, { ...fetchOpts, etag: known.get(id)?.etag ?? null });
        consecutiveFailures = 0;
        if (r.status === "ok") {
          await store.save(id, { full: r.full, thumb: r.thumb, square: r.square, etag: r.etag });
          summary.saved++;
        } else if (r.status === "unchanged") {
          await store.touch(id);
          summary.unchanged++;
        } else {
          summary.missing.push(id);
        }
      } catch (err) {
        consecutiveFailures++;
        summary.failed++;
        logger.warn({ err, assetId: id }, "card art download failed");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (store.missingSquare && store.loadFull && store.saveSquare) {
    const square = fetchOpts.square ?? makeSquare;
    for (const id of await store.missingSquare()) {
      try {
        const full = await store.loadFull(id);
        const icon = full ? await square(full) : null;
        if (icon) {
          await store.saveSquare(id, icon);
          summary.squared++;
        }
      } catch (err) {
        logger.warn({ err, assetId: id }, "card icon generation failed");
      }
    }
  }
  return summary;
}
