import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB, saveDB } from "../db/jsonStore.js";

export interface Preset {
  id: string;
  name: string;
  team: (string | null)[];
  leader: string | null;
  isActive: boolean;
}

export const DEFAULT_PRESETS: Preset[] = [
  { id: "preset_1", name: "Preset 1", team: [null, null, null, null, null], leader: null, isActive: true },
  { id: "preset_2", name: "Preset 2", team: [null, null, null, null, null], leader: null, isActive: false },
  { id: "preset_3", name: "Preset 3", team: [null, null, null, null, null], leader: null, isActive: false },
  { id: "preset_4", name: "Preset 4", team: [null, null, null, null, null], leader: null, isActive: false },
  { id: "preset_5", name: "Preset 5", team: [null, null, null, null, null], leader: null, isActive: false },
];

const mapRow = (row: any): Preset => ({
  id: row.id,
  name: row.name,
  team: row.team,
  leader: row.leader,
  isActive: row.isactive !== undefined ? row.isactive : row.isActive,
});

export const getPresetsByDevice = async (deviceId: string): Promise<Preset[]> => {
  if (config.isProd) {
    const client = await getPool().connect();
    try {
      let result = await client.query("SELECT * FROM presets WHERE device_id = $1 ORDER BY id ASC", [deviceId]);
      if (result.rows.length === 0) {
        await initDefaults(client, deviceId);
        result = await client.query("SELECT * FROM presets WHERE device_id = $1 ORDER BY id ASC", [deviceId]);
      }
      return result.rows.map(mapRow);
    } finally {
      client.release();
    }
  }
  const db = loadDB();
  if (!db.presets[deviceId]) {
    db.presets[deviceId] = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    saveDB(db);
  }
  return db.presets[deviceId];
};

const initDefaults = async (client: any, deviceId: string): Promise<void> => {
  await client.query("BEGIN");
  for (const p of DEFAULT_PRESETS) {
    await client.query(
      `INSERT INTO presets (device_id, id, name, team, leader, isActive)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [deviceId, p.id, p.name, JSON.stringify(p.team), p.leader, p.isActive]
    );
  }
  await client.query("COMMIT");
};

export const upsertPresets = async (deviceId: string, presets: Preset[]): Promise<void> => {
  if (config.isProd) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (const p of presets) {
        const isActiveVal = p.isActive !== undefined ? p.isActive : false;
        await client.query(
          `INSERT INTO presets (device_id, id, name, team, leader, isActive)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)
           ON CONFLICT (device_id, id)
           DO UPDATE SET name = EXCLUDED.name, team = EXCLUDED.team, leader = EXCLUDED.leader, isActive = EXCLUDED.isActive`,
          [deviceId, p.id, p.name, JSON.stringify(p.team), p.leader, isActiveVal]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return;
  }
  const db = loadDB();
  db.presets[deviceId] = presets;
  saveDB(db);
};
