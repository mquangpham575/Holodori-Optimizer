import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { listCharacters } from "../services/characterService.js";
import { getMediaMirror, loadMirroredMedia } from "../services/mediaService.js";
import { cdnMediaUrl, isMediaAssetId, parseByteRange, type MediaKind } from "../etl/card-media.js";
import { logger } from "../logger.js";

const router = Router();

// A card can be in the catalog before any artwork for it exists in a source we
// may read (master data lands first; art only ships with the optimizer's bundle
// or via an admin upload). Rather than 404 (broken image icons everywhere the
// UI renders /images/cards/<assetId>.webp), fall back to the member's portrait.
const portraitFor = async (assetId: string): Promise<string | null> => {
  const characters: any[] = await listCharacters();
  const owner = characters.find(
    (c) => c.assetId === assetId || (Array.isArray(c.cards) && c.cards.some((v: any) => v?.assetId === assetId))
  );
  if (!owner) return null;
  const candidates = [owner.fallbackImage, `/images/${owner.id}.webp`].filter(
    (p): p is string => typeof p === "string" && /^\/images\/[A-Za-z0-9_-]+\.(webp|png|jpg)$/.test(p)
  );
  return candidates.find((p) => fs.existsSync(path.join(config.imagesDir, path.basename(p)))) ?? null;
};

// Artwork can be replaced (admin upload, upstream update), so it must not be cached
// as immutable: revalidate daily, and let stale copies serve while refreshing.
const ART_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const sendWebp = (res: any, data: Buffer, cache = ART_CACHE) => {
  res.set("Content-Type", "image/webp");
  res.set("Cache-Control", cache);
  res.send(data);
};

// Full illustrations mirrored from the art CDN (see etl/card-art-cdn.ts):
// /images/cards-full/<id>.webp is the original, /images/cards-thumb/<id>.webp the
// grid-size version. In dev these are plain files served by express.static.
const mirroredArt = (column: "full_img" | "thumb_img") => async (req: any, res: any) => {
  const file = String(req.params.file);
  if (!/^[A-Za-z0-9_-]+\.webp$/.test(file)) {
    res.status(400).end();
    return;
  }
  if (!config.isProd) {
    res.status(404).end();
    return;
  }
  try {
    const result = await getPool().query(`SELECT ${column} AS data FROM card_art_full WHERE asset_id = $1`, [
      file.replace(/\.webp$/, ""),
    ]);
    if (result.rows.length === 0) {
      res.status(404).end();
      return;
    }
    sendWebp(res, result.rows[0].data);
  } catch (err) {
    logger.error({ err }, "Error serving mirrored card art");
    res.status(500).end();
  }
};
router.get("/cards-full/:file", mirroredArt("full_img"));
router.get("/cards-thumb/:file", mirroredArt("thumb_img"));

// 5-star animation / signature videos (see etl/card-media.ts). A mirrored video is served
// from our own store (dev: plain files, which express.static answers before this router
// is reached); anything else is redirected to the CDN as before and queued for mirroring.
const CDN_REDIRECT_CACHE = "public, max-age=60";
const VIDEO_CACHE = "public, max-age=2592000, immutable";

const sendVideo = (req: any, res: any, data: Buffer) => {
  res.set("Content-Type", "video/mp4");
  res.set("Cache-Control", VIDEO_CACHE);
  res.set("Accept-Ranges", "bytes");
  // Browsers ask for byte ranges to start playback early and to seek.
  const range = parseByteRange(req.headers.range, data.length);
  if (range === "unsatisfiable") {
    res.status(416).set("Content-Range", `bytes */${data.length}`).end();
    return;
  }
  if (range) {
    res.status(206);
    res.set("Content-Range", `bytes ${range.start}-${range.end}/${data.length}`);
    res.set("Content-Length", String(range.end - range.start + 1));
    res.end(data.subarray(range.start, range.end + 1));
    return;
  }
  res.set("Content-Length", String(data.length));
  res.end(data);
};

const cardVideo = (kind: MediaKind) => async (req: any, res: any) => {
  const match = /^([A-Za-z0-9_-]+)\.mp4$/.exec(String(req.params.file));
  if (!match) {
    res.status(400).end();
    return;
  }
  const assetId = match[1];
  const mirror = getMediaMirror();
  if (!mirror || !isMediaAssetId(assetId)) {
    res.status(404).end();
    return;
  }
  try {
    if (config.isProd) {
      const data = await loadMirroredMedia(kind, assetId);
      if (data) {
        sendVideo(req, res, data);
        return;
      }
    }
    mirror.enqueue(kind, assetId);
    res.set("Cache-Control", CDN_REDIRECT_CACHE);
    res.redirect(302, cdnMediaUrl(kind, assetId, config.cardArtCdnBase));
  } catch (err) {
    logger.error({ err }, "Error serving card video");
    res.status(500).end();
  }
};
router.get("/cards-anim/:file", cardVideo("anim"));
router.get("/cards-sign/:file", cardVideo("sign"));

// Card artwork is served from Postgres in prod (kept in sync by the holodori
// sync); in dev the static /images handler wins when art is on disk.
router.get("/cards/:file", async (req, res) => {
  const file = String(req.params.file);
  if (!/^[A-Za-z0-9_-]+\.webp$/.test(file)) {
    res.status(400).end();
    return;
  }
  const assetId = file.replace(/\.webp$/, "");
  try {
    if (config.isProd) {
      const result = await getPool().query("SELECT data FROM card_art WHERE asset_id = $1", [assetId]);
      if (result.rows.length > 0) {
        sendWebp(res, result.rows[0].data);
        return;
      }
      // No bundled art for this card: use the square icon cut from the mirrored
      // illustration (never the 16:9 original, which would be squeezed in the frames).
      const mirrored = await getPool().query(
        "SELECT square_img FROM card_art_full WHERE asset_id = $1 AND square_img IS NOT NULL",
        [assetId]
      );
      if (mirrored.rows.length > 0) {
        sendWebp(res, mirrored.rows[0].square_img, "public, max-age=300");
        return;
      }
    } else if (fs.existsSync(path.join(config.imagesDir, "cards-square", `${assetId}.webp`))) {
      res.set("Cache-Control", "public, max-age=300");
      res.redirect(302, `/images/cards-square/${assetId}.webp`);
      return;
    }
    const portrait = await portraitFor(assetId);
    if (portrait) {
      // Short cache so the real artwork replaces the portrait once it exists.
      res.set("Cache-Control", "public, max-age=300");
      res.redirect(302, portrait);
      return;
    }
    res.status(404).end();
  } catch (err) {
    logger.error({ err }, "Error serving card art");
    res.status(500).end();
  }
});

export default router;
