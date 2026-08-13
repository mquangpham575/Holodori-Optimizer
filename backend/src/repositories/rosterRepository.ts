import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB, saveDB } from "../db/jsonStore.js";

export const getRosterByDevice = async (deviceId: string): Promise<string[]> => {
  if (config.isProd) {
    const client = await getPool().connect();
    try {
      let result = await client.query("SELECT owned_ids FROM roster WHERE device_id = $1", [deviceId]);
      if (result.rows.length === 0) {
        const charResult = await client.query("SELECT id FROM characters");
        const allIds = charResult.rows.map((c: any) => c.id);
        await client.query(
          "INSERT INTO roster (device_id, owned_ids) VALUES ($1, $2::jsonb)",
          [deviceId, JSON.stringify(allIds)]
        );
        result = await client.query("SELECT owned_ids FROM roster WHERE device_id = $1", [deviceId]);
      }
      return result.rows[0].owned_ids;
    } finally {
      client.release();
    }
  }
  const db = loadDB();
  if (!db.roster[deviceId]) {
    db.roster[deviceId] = db.characters.map((c) => c.id);
    saveDB(db);
  }
  return db.roster[deviceId];
};

export const upsertRoster = async (deviceId: string, ownedIds: string[]): Promise<void> => {
  if (config.isProd) {
    await getPool().query(
      `INSERT INTO roster (device_id, owned_ids)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (device_id)
       DO UPDATE SET owned_ids = EXCLUDED.owned_ids`,
      [deviceId, JSON.stringify(ownedIds)]
    );
    return;
  }
  const db = loadDB();
  db.roster[deviceId] = ownedIds;
  saveDB(db);
};
