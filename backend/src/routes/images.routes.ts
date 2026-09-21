import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { listCharacters } from "../services/characterService.js";
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
        res.set("Content-Type", "image/webp");
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.send(result.rows[0].data);
        return;
      }
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
