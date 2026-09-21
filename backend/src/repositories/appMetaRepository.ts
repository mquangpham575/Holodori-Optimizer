import { getPool } from "../db/postgres.js";
import { logger } from "../logger.js";

export const getHolodoriHash = async (client: any): Promise<string | null> => {
  const res = await client.query("SELECT value FROM app_meta WHERE key = $1", ["holodori_packed_hash"]);
  return res.rows[0]?.value || null;
};

export const setHolodoriHash = async (client: any, hash: string, sourceVersion: string): Promise<void> => {
  await client.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    ["holodori_packed_hash", hash]
  );
  await client.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    ["holodori_source_version", sourceVersion]
  );
};

export const recordSyncEvent = async (eventType: string, payload: any): Promise<void> => {
  try {
    await getPool().query(
      "INSERT INTO sync_events (event_type, payload) VALUES ($1, $2::jsonb)",
      [eventType, JSON.stringify(payload)]
    );
  } catch (err) {
    logger.error({ err }, "Failed to record sync event");
  }
};
