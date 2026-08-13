import pkg from "pg";
import config from "../config.js";
import { loadDB } from "./jsonStore.js";
import { loadFrontendData } from "../services/dataLoader.js";
import { logger } from "../logger.js";

const { Pool } = pkg;
export type Pool = InstanceType<typeof Pool>;

let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl ?? undefined,
      ...(config.pgSslDisabled
        ? {}
        : { ssl: { rejectUnauthorized: false } }),
    });
  }
  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

// PostgreSQL Schema Initialization
export const initPostgresSchema = async (): Promise<void> => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Migrate presets/roster tables to support device_id partitioning.
    const presetsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'presets' AND column_name = 'device_id'
    `);
    if (presetsCheck.rows.length === 0) {
      logger.info("Migrating PostgreSQL tables to support device partitioning...");
      await client.query("DROP TABLE IF EXISTS presets CASCADE");
      await client.query("DROP TABLE IF EXISTS roster CASCADE");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        rarity TEXT NOT NULL,
        "group" TEXT NOT NULL,
        type TEXT NOT NULL,
        accentColor TEXT NOT NULL,
        image TEXT NOT NULL,
        avatar TEXT NOT NULL,
        stats JSONB NOT NULL,
        skills JSONB NOT NULL,
        "cardData" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "cards" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "characterId" TEXT,
        "attributeId" TEXT,
        "groupIds" JSONB,
        "assetId" TEXT
      )
    `);
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS "cardData" JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS "cards" JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS "characterId" TEXT`);
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS "attributeId" TEXT`);
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS "groupIds" JSONB`);
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS "assetId" TEXT`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS presets (
        device_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        team JSONB NOT NULL,
        leader TEXT,
        isActive BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (device_id, id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS roster (
        device_id TEXT PRIMARY KEY,
        owned_ids JSONB NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS guides (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        category TEXT NOT NULL,
        readTime TEXT NOT NULL,
        author TEXT NOT NULL,
        date TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `);
    await client.query(`ALTER TABLE guides ADD COLUMN IF NOT EXISTS contentUrl JSONB`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS card_art (
        asset_id TEXT PRIMARY KEY,
        data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title_lang_id TEXT,
        asset_id TEXT,
        jacket_asset_id TEXT,
        playing_seconds INTEGER,
        character_ids JSONB,
        mv_url TEXT,
        live_score_coefficient_permil INTEGER
      )
    `);

    // Precomputed search index — rebuilt by the Kafka worker on catalog.synced.
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_search (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT,
        type TEXT,
        title TEXT,
        payload JSONB NOT NULL
      )
    `);

    // Event log for catalog sync events (published to Kafka when configured).
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_events (
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query("COMMIT");
    logger.info("PostgreSQL schema validated successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Error initializing PostgreSQL schema");
    throw err;
  } finally {
    client.release();
  }
};

export const seedPostgres = async (): Promise<void> => {
  const client = await getPool().connect();
  try {
    const backup = loadDB();

    let characters = backup.characters || [];
    let guides = backup.guides || [];
    if (characters.length === 0 || guides.length === 0) {
      const module = await loadFrontendData();
      if (characters.length === 0) characters = module.CHARACTERS;
      if (guides.length === 0) guides = module.GUIDES;
    }

    logger.info(`Syncing ${characters.length} characters in PostgreSQL...`);
    for (const char of characters) {
      await client.query(
        `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills, "cardData", "cards", "characterId", "attributeId", "groupIds", "assetId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           title = EXCLUDED.title,
           rarity = EXCLUDED.rarity,
           "group" = EXCLUDED."group",
           type = EXCLUDED.type,
           accentColor = EXCLUDED.accentColor,
           image = EXCLUDED.image,
           avatar = EXCLUDED.avatar,
           stats = EXCLUDED.stats,
           skills = EXCLUDED.skills,
           "cardData" = EXCLUDED."cardData",
           "cards" = EXCLUDED."cards",
           "characterId" = EXCLUDED."characterId",
           "attributeId" = EXCLUDED."attributeId",
           "groupIds" = EXCLUDED."groupIds",
           "assetId" = EXCLUDED."assetId"`,
        [
          char.id,
          char.name,
          char.title,
          char.rarity,
          char.group,
          char.type,
          char.accentColor,
          char.image,
          char.avatar,
          JSON.stringify(char.stats),
          JSON.stringify(char.skills),
          JSON.stringify(char.cardData || {}),
          JSON.stringify(char.cards || []),
          char.characterId || null,
          char.attributeId || null,
          JSON.stringify(char.groupIds || []),
          char.assetId || null,
        ]
      );
    }

    // Prune legacy rows (old ids) that duplicate a current characterId.
    const activeCharacterIds = characters.map((c) => c.id);
    const activeMemberIds = characters
      .map((c) => c.characterId)
      .filter((id): id is string => Boolean(id));
    if (activeCharacterIds.length > 0 && activeMemberIds.length > 0) {
      const pruneRes = await client.query(
        `DELETE FROM characters
         WHERE NOT (id = ANY($1)) AND "characterId" = ANY($2)`,
        [activeCharacterIds, activeMemberIds]
      );
      if ((pruneRes.rowCount ?? 0) > 0) {
        logger.info(`Pruned ${pruneRes.rowCount} duplicate character rows from PostgreSQL.`);
      }
    }
    logger.info("Characters synchronized successfully in PostgreSQL!");

    logger.info("Syncing guides in PostgreSQL...");
    const activeGuideIds = guides.map((g) => g.id);
    if (activeGuideIds.length > 0) {
      await client.query("DELETE FROM guides WHERE NOT (id = ANY($1))", [activeGuideIds]);
    } else {
      await client.query("DELETE FROM guides");
    }
    for (const guide of guides) {
      await client.query(
        `INSERT INTO guides (id, title, summary, category, readTime, author, date, content, contentUrl)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           category = EXCLUDED.category,
           readTime = EXCLUDED.readTime,
           author = EXCLUDED.author,
           date = EXCLUDED.date,
           content = EXCLUDED.content,
           contentUrl = EXCLUDED.contentUrl`,
        [
          guide.id,
          typeof guide.title === "string" ? guide.title : JSON.stringify(guide.title),
          typeof guide.summary === "string" ? guide.summary : JSON.stringify(guide.summary),
          guide.category,
          guide.readTime,
          guide.author,
          guide.date,
          guide.content || "",
          guide.contentUrl ? JSON.stringify(guide.contentUrl) : null,
        ]
      );
    }
    logger.info("Guides synchronized successfully in PostgreSQL!");

    logger.info(`Syncing ${(backup.songs || []).length} songs in PostgreSQL...`);
    await upsertSongsPG(backup.songs || []);
    logger.info("Songs synchronized successfully in PostgreSQL!");
  } catch (err) {
    logger.error({ err }, "Error synchronizing PostgreSQL");
  } finally {
    client.release();
  }
};

export const upsertSongsPG = async (songs: any[]): Promise<void> => {
  if (!songs || songs.length === 0) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM songs");
    for (const s of songs) {
      await client.query(
        `INSERT INTO songs (id, title_lang_id, asset_id, jacket_asset_id, playing_seconds, character_ids, mv_url, live_score_coefficient_permil)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          s.id,
          s.titleLangId,
          s.assetId,
          s.jacketAssetId,
          s.playingSeconds,
          JSON.stringify(s.characterIds || []),
          s.mvUrl || null,
          s.liveScoreCoefficientPermil || 0,
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
};

export const upsertCardArtPG = async (entries: any[]): Promise<void> => {
  if (!entries || entries.length === 0) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const entry of entries) {
      await client.query(
        `INSERT INTO card_art (asset_id, data) VALUES ($1, $2)
         ON CONFLICT (asset_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [entry.assetId, entry.data]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
