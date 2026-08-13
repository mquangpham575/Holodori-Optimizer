import { Router } from "express";
import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { logger } from "../logger.js";

const router = Router();

// Card artwork is served from Postgres in prod (kept in sync by the holodori
// sync); in dev the static /images handler wins when art is on disk.
router.get("/cards/:file", async (req, res) => {
  const file = req.params.file;
  if (!/^[A-Za-z0-9_-]+\.webp$/.test(file)) {
    res.status(400).end();
    return;
  }
  if (!config.isProd) {
    res.status(404).end();
    return;
  }
  const assetId = file.replace(/\.webp$/, "");
  try {
    const result = await getPool().query("SELECT data FROM card_art WHERE asset_id = $1", [assetId]);
    if (result.rows.length === 0) {
      res.status(404).end();
      return;
    }
    res.set("Content-Type", "image/webp");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(result.rows[0].data);
  } catch (err) {
    logger.error({ err }, "Error serving card art");
    res.status(500).end();
  }
});

export default router;
