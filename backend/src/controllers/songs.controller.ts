import type { Request, Response } from "express";
import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB } from "../db/jsonStore.js";

export const list = async (req: Request, res: Response): Promise<void> => {
  if (config.isProd) {
    const result = await getPool().query("SELECT * FROM songs ORDER BY id ASC");
    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        titleLangId: r.title_lang_id,
        assetId: r.asset_id,
        jacketAssetId: r.jacket_asset_id,
        playingSeconds: r.playing_seconds,
        characterIds: r.character_ids || [],
        mvUrl: r.mv_url,
        liveScoreCoefficientPermil: r.live_score_coefficient_permil || 0,
      }))
    );
    return;
  }
  res.json(loadDB().songs || []);
};
