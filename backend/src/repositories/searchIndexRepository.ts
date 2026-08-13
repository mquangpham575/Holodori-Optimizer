import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB } from "../db/jsonStore.js";

let memoryIndex: any[] = [];
let memoryIndexLoaded = false;

export const rebuildSearchIndex = async (): Promise<number> => {
  if (config.isProd) {
    const pool = getPool();
    const res = await pool.query("SELECT * FROM characters");
    const rows = res.rows;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM card_search");
      for (const row of rows) {
        await client.query(
          `INSERT INTO card_search (id, name, group_name, type, title, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            row.id,
            row.name,
            row.group || null,
            row.type || null,
            row.title || null,
            JSON.stringify(row),
          ]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return rows.length;
  }

  const db = loadDB();
  memoryIndex = db.characters || [];
  memoryIndexLoaded = true;
  return memoryIndex.length;
};

export const searchCharacters = async (q: string): Promise<any[]> => {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return [];

  // Dev (JSON store): lazily build the in-memory index on first use.
  if (!config.isProd && !memoryIndexLoaded) {
    await rebuildSearchIndex();
  }

  if (config.isProd) {
    const like = `%${query}%`;
    const res = await getPool().query(
      `SELECT payload FROM card_search
       WHERE lower(name) LIKE $1 OR lower(title) LIKE $1 OR lower(group_name) LIKE $1
       LIMIT 50`,
      [like]
    );
    return res.rows.map((r: any) => r.payload);
  }

  return memoryIndex
    .filter((c) =>
      [c.name, c.title, c.group, c.type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    )
    .slice(0, 50);
};

// In-memory read cache with a short TTL for hot read endpoints.
export const createTTLCache = <T>(ttlMs = 30000) => {
  const cache = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key: string): void {
      cache.delete(key);
    },
  };
};
