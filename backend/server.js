import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pkg from 'pg';
import { fetchPacked, packedToLegacySnapshot, enrichCharacters, packedContentHash } from './etl/holodori-sync.js';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const dbPath = path.join(__dirname, 'database.json');
const isProd = !!process.env.DATABASE_URL;
let pgPool = null;

if (isProd) {
  console.log("DATABASE_URL found. Initializing PostgreSQL connection pool...");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

// Admin Authentication Configuration
const ADMIN_PASSWORD = isProd ? (process.env.ADMIN_PASSWORD || 'admin123') : 'admin123';

const requireAdmin = (req, res, next) => {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin password' });
  }
  next();
};

// JSON file database helpers
const loadDB = () => {
  if (!fs.existsSync(dbPath)) {
    return {
      characters: [],
      presets: {},
      roster: {},
      guides: [],
      songs: []
    };
  }
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.presets)) parsed.presets = {};
    if (Array.isArray(parsed.roster)) parsed.roster = {};
    if (!parsed.guides) parsed.guides = [];
    if (!parsed.songs) parsed.songs = [];
    return parsed;
  } catch (err) {
    console.error("Error reading database.json:", err);
    return { characters: [], presets: {}, roster: {}, guides: [], songs: [] };
  }
};

const saveDB = (data) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database.json:", err);
  }
};

// PostgreSQL Schema Initialization
const initPostgresSchema = async () => {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    
    // Check if we need to migrate/recreate presets table to support device_id partitioning
    const presetsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'presets' AND column_name = 'device_id'
    `);
    
    if (presetsCheck.rows.length === 0) {
      console.log("Migrating PostgreSQL tables to support device partitioning...");
      await client.query("DROP TABLE IF EXISTS presets CASCADE");
      await client.query("DROP TABLE IF EXISTS roster CASCADE");
    }

    // (Migration completed: characters table is now persistent)
    // await client.query("DROP TABLE IF EXISTS characters CASCADE");

    // Create characters table (shared)
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

    // Create presets table (partitioned by device_id)
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

    // Create roster table (partitioned by device_id)
    await client.query(`
      CREATE TABLE IF NOT EXISTS roster (
        device_id TEXT PRIMARY KEY,
        owned_ids JSONB NOT NULL
      )
    `);

    // Create guides table (shared)
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
    
    // Ensure contentUrl column exists
    await client.query(`
      ALTER TABLE guides ADD COLUMN IF NOT EXISTS contentUrl JSONB
    `);

    // App-level metadata (holodori sync version tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await client.query("COMMIT");
    console.log("PostgreSQL schema validated successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error initializing PostgreSQL schema:", err);
    throw err;
  } finally {
    client.release();
  }
};

// PostgreSQL Seeding & Synchronization
const seedPostgres = async () => {
  const client = await pgPool.connect();
  try {
    console.log("Synchronizing database tables with src/data.js...");
    const module = await import('../frontend/src/data.js');

    // 1. Sync characters table
    console.log("Syncing characters in PostgreSQL...");
    for (const char of module.CHARACTERS) {
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
          char.assetId || null
        ]
      );
    }
    console.log("Characters synchronized successfully in PostgreSQL!");

    // 2. Sync guides table (delete inactive guides and upsert active ones)
    console.log("Syncing guides in PostgreSQL...");
    const activeGuideIds = module.GUIDES.map(g => g.id);
    if (activeGuideIds.length > 0) {
      await client.query("DELETE FROM guides WHERE NOT (id = ANY($1))", [activeGuideIds]);
    } else {
      await client.query("DELETE FROM guides");
    }

    for (const guide of module.GUIDES) {
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
          typeof guide.title === 'string' ? guide.title : JSON.stringify(guide.title),
          typeof guide.summary === 'string' ? guide.summary : JSON.stringify(guide.summary),
          guide.category,
          guide.readTime,
          guide.author,
          guide.date,
          guide.content || '',
          guide.contentUrl ? JSON.stringify(guide.contentUrl) : null
        ]
      );
    }
    console.log("Guides synchronized successfully in PostgreSQL!");
  } catch (err) {
    console.error("Error synchronizing PostgreSQL:", err);
  } finally {
    client.release();
  }
};

// HolodoriDB live card sync (prod): applies upstream card updates to Postgres
let holodoriSyncInFlight = false;

const getHolodoriHash = async (client) => {
  const res = await client.query("SELECT value FROM app_meta WHERE key = $1", ["holodori_packed_hash"]);
  return res.rows[0]?.value || null;
};

const setHolodoriHash = async (client, hash, sourceVersion) => {
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

const syncHolodoriCards = async () => {
  if (!isProd || holodoriSyncInFlight) return;
  holodoriSyncInFlight = true;
  try {
    const packed = await fetchPacked();
    const newHash = packedContentHash(packed);
    const newVersion = packed.sourceVersion;
    if (!newVersion) throw new Error("BUNDLED_PACKED has no sourceVersion");

    const client = await pgPool.connect();
    try {
      const currentHash = await getHolodoriHash(client);
      if (currentHash === newHash) {
        console.log(`HolodoriDB sync: already up to date (${newVersion}).`);
        return;
      }

      console.log(`HolodoriDB sync: applying update (${newVersion}, hash ${newHash.slice(0, 12)})`);
      const snapshot = packedToLegacySnapshot(packed);

      await client.query("BEGIN");
      const skeletonRes = await client.query("SELECT * FROM characters");
      const { characters, skipped } = enrichCharacters(skeletonRes.rows, snapshot);
      if (skipped.length > 0) {
        console.warn(`HolodoriDB sync: no card match for ${skipped.length} characters, left unchanged: ${skipped.join(", ")}`);
      }

      for (const char of characters) {
        await client.query(
          `UPDATE characters SET
             title = $2, type = $3, stats = $4::jsonb, skills = $5::jsonb,
             "cardData" = $6::jsonb, "cards" = $7::jsonb,
             "characterId" = $8, "attributeId" = $9, "assetId" = $10
           WHERE id = $1`,
          [
            char.id,
            char.title,
            char.type,
            JSON.stringify(char.stats),
            JSON.stringify(char.skills),
            JSON.stringify(char.cardData || {}),
            JSON.stringify(char.cards || []),
            char.characterId || null,
            char.attributeId || null,
            char.assetId || null
          ]
        );
      }

      await setHolodoriHash(client, newHash, newVersion);
      await client.query("COMMIT");
      console.log(`HolodoriDB sync: applied upstream update for ${characters.length} characters (${newVersion}).`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("HolodoriDB sync failed:", err.message);
  } finally {
    holodoriSyncInFlight = false;
  }
};

// Database Seeding Coordinator
const seedDatabase = async () => {
  if (isProd) {
    try {
      await initPostgresSchema();
      await seedPostgres();
    } catch (err) {
      console.error("Could not initialize PostgreSQL database. Falling back to local files.", err);
    }
  } else {
    const db = loadDB();
    let updated = false;

    if (!db.characters || db.characters.length === 0) {
    console.log("Seeding characters from src/data.js...");
    try {
      const module = await import('../frontend/src/data.js');
      db.characters = module.CHARACTERS;
      updated = true;
    } catch (err) {
      console.error("Error importing data.js for seeding:", err);
    }

    }
    if (!db.guides || db.guides.length === 0) {
      console.log("Seeding guides from src/data.js...");
      try {
        const module = await import('../frontend/src/data.js');
        db.guides = module.GUIDES;
        updated = true;
      } catch (err) {
        console.error("Error seeding guides:", err);
      }
    }

    if (!db.presets || Array.isArray(db.presets)) {
      db.presets = {};
      updated = true;
    }

    if (!db.roster || Array.isArray(db.roster)) {
      db.roster = {};
      updated = true;
    }

    if (updated) {
      saveDB(db);
      console.log("Database successfully seeded!");
    }
  }
};

await seedDatabase();

if (isProd) {
  syncHolodoriCards();
  setInterval(syncHolodoriCards, 6 * 60 * 60 * 1000);
}

// GET /api/health
app.get('/api/health', async (req, res) => {
  let postgresStatus = 'operational';
  if (isProd) {
    try {
      const client = await pgPool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (err) {
      console.error("Health check failed for Postgres:", err);
      postgresStatus = 'offline';
    }
  } else {
    postgresStatus = 'local_file_db';
  }

  const isAllOperational = postgresStatus === 'operational' || postgresStatus === 'local_file_db';

  res.json({
    status: isAllOperational ? 'operational' : 'degraded',
    services: {
      backend: 'operational',
      postgres: postgresStatus
    }
  });
});



// GET /api/characters
app.get('/api/characters', async (req, res) => {
  if (isProd) {
    try {
      const result = await pgPool.query("SELECT * FROM characters");
      const mapped = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        title: row.title,
        rarity: row.rarity,
        group: row.group,
        type: row.type,
        accentColor: row.accentcolor !== undefined ? row.accentcolor : row.accentColor,
        image: row.image,
        avatar: row.avatar,
        stats: row.stats,
        skills: row.skills,
        cardData: row.cardData,
        cards: row.cards,
        characterId: row.characterId,
        attributeId: row.attributeId,
        groupIds: row.groupIds,
        assetId: row.assetId
      }));
      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    res.json(db.characters || []);
  }
});

// GET /api/songs
app.get('/api/songs', (req, res) => {
  const db = loadDB();
  res.json(db.songs || []);
});

// GET /api/presets
app.get('/api/presets', async (req, res) => {
  const deviceId = req.headers['x-device-id'] || 'default_device';
  if (isProd) {
    const client = await pgPool.connect();
    try {
      let result = await client.query("SELECT * FROM presets WHERE device_id = $1 ORDER BY id ASC", [deviceId]);
      if (result.rows.length === 0) {
        console.log(`Initializing default presets for device: ${deviceId}`);
        const defaultPresets = [
          { id: 'preset_1', name: 'Preset 1', team: [null, null, null, null, null], leader: null, isActive: true },
          { id: 'preset_2', name: 'Preset 2', team: [null, null, null, null, null], leader: null, isActive: false },
          { id: 'preset_3', name: 'Preset 3', team: [null, null, null, null, null], leader: null, isActive: false },
          { id: 'preset_4', name: 'Preset 4', team: [null, null, null, null, null], leader: null, isActive: false },
          { id: 'preset_5', name: 'Preset 5', team: [null, null, null, null, null], leader: null, isActive: false }
        ];
        await client.query("BEGIN");
        for (const p of defaultPresets) {
          await client.query(
            `INSERT INTO presets (device_id, id, name, team, leader, isActive) 
             VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
            [deviceId, p.id, p.name, JSON.stringify(p.team), p.leader, p.isActive]
          );
        }
        await client.query("COMMIT");
        result = await client.query("SELECT * FROM presets WHERE device_id = $1 ORDER BY id ASC", [deviceId]);
      }
      const mapped = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        team: row.team,
        leader: row.leader,
        isActive: row.isactive !== undefined ? row.isactive : row.isActive
      }));
      res.json(mapped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } else {
    const db = loadDB();
    if (!db.presets[deviceId]) {
      db.presets[deviceId] = [
        { id: 'preset_1', name: 'Preset 1', team: [null, null, null, null, null], leader: null, isActive: true },
        { id: 'preset_2', name: 'Preset 2', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_3', name: 'Preset 3', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_4', name: 'Preset 4', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_5', name: 'Preset 5', team: [null, null, null, null, null], leader: null, isActive: false }
      ];
      saveDB(db);
    }
    res.json(db.presets[deviceId]);
  }
});

// PUT /api/presets
app.put('/api/presets', async (req, res) => {
  const deviceId = req.headers['x-device-id'] || 'default_device';
  const updatedPresets = req.body;
  if (!Array.isArray(updatedPresets)) {
    return res.status(400).json({ error: 'Body must be an array of presets' });
  }

  if (isProd) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      for (const p of updatedPresets) {
        const isActiveVal = p.isActive !== undefined ? p.isActive : (p.isactive !== undefined ? p.isactive : false);
        await client.query(
          `INSERT INTO presets (device_id, id, name, team, leader, isActive) 
           VALUES ($1, $2, $3, $4::jsonb, $5, $6) 
           ON CONFLICT (device_id, id) 
           DO UPDATE SET name = EXCLUDED.name, team = EXCLUDED.team, leader = EXCLUDED.leader, isActive = EXCLUDED.isActive`,
          [deviceId, p.id, p.name, JSON.stringify(p.team), p.leader, isActiveVal]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } else {
    const db = loadDB();
    db.presets[deviceId] = updatedPresets;
    saveDB(db);
    res.json({ success: true });
  }
});

// GET /api/roster
app.get('/api/roster', async (req, res) => {
  const deviceId = req.headers['x-device-id'] || 'default_device';
  if (isProd) {
    const client = await pgPool.connect();
    try {
      let result = await client.query("SELECT owned_ids FROM roster WHERE device_id = $1", [deviceId]);
      if (result.rows.length === 0) {
        console.log(`Initializing default roster for device: ${deviceId}`);
        const charResult = await client.query("SELECT id FROM characters");
        const allIds = charResult.rows.map(c => c.id);
        await client.query(
          "INSERT INTO roster (device_id, owned_ids) VALUES ($1, $2::jsonb)",
          [deviceId, JSON.stringify(allIds)]
        );
        result = await client.query("SELECT owned_ids FROM roster WHERE device_id = $1", [deviceId]);
      }
      res.json(result.rows[0].owned_ids);
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } else {
    const db = loadDB();
    if (!db.roster[deviceId]) {
      db.roster[deviceId] = db.characters.map(c => c.id);
      saveDB(db);
    }
    res.json(db.roster[deviceId]);
  }
});

// PUT /api/roster
app.put('/api/roster', async (req, res) => {
  const deviceId = req.headers['x-device-id'] || 'default_device';
  const ownedIds = req.body;
  if (!Array.isArray(ownedIds)) {
    return res.status(400).json({ error: 'Body must be an array of character IDs' });
  }

  if (isProd) {
    try {
      await pgPool.query(
        `INSERT INTO roster (device_id, owned_ids) 
         VALUES ($1, $2::jsonb) 
         ON CONFLICT (device_id) 
         DO UPDATE SET owned_ids = EXCLUDED.owned_ids`,
        [deviceId, JSON.stringify(ownedIds)]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    db.roster[deviceId] = ownedIds;
    saveDB(db);
    res.json({ success: true });
  }
});

// GET /api/guides
app.get('/api/guides', async (req, res) => {
  if (isProd) {
    try {
      const result = await pgPool.query("SELECT * FROM guides ORDER BY id ASC");
      const parsedGuides = result.rows.map(row => {
        let title = row.title;
        let summary = row.summary;
        let contentUrl = row.contenturl || row.contentUrl; // Handle pg lowercase column names

        try {
          if (typeof title === 'string' && (title.startsWith('{') || title.startsWith('['))) {
            title = JSON.parse(title);
          }
        } catch {}
        try {
          if (typeof summary === 'string' && (summary.startsWith('{') || summary.startsWith('['))) {
            summary = JSON.parse(summary);
          }
        } catch {}
        try {
          if (typeof contentUrl === 'string' && (contentUrl.startsWith('{') || contentUrl.startsWith('['))) {
            contentUrl = JSON.parse(contentUrl);
          }
        } catch {}

        return {
          ...row,
          title,
          summary,
          contentUrl
        };
      });
      res.json(parsedGuides);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    res.json(db.guides || []);
  }
});

// ADMIN ENDPOINTS

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  const { fileName, base64Data } = req.body;
  if (!fileName || !base64Data) {
    return res.status(400).json({ error: 'Filename and base64Data are required' });
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    const ext = path.extname(fileName) || '.webp';
    const safeName = `upload_${Date.now()}${ext}`;
    
    const targetDir = path.join(__dirname, '../frontend/public/images');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const targetPath = path.join(targetDir, safeName);
    fs.writeFileSync(targetPath, buffer);
    
    console.log(`Saved uploaded image to: ${targetPath}`);
    res.json({ success: true, url: `/images/${safeName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Characters CRUD

app.post('/api/admin/sync-from-file', requireAdmin, async (req, res) => {
  const { skills, stats, bio, full, charIds } = req.body;
  if (!skills && !stats && !bio && !full) {
    return res.status(400).json({ error: 'At least one sync option must be selected' });
  }

  try {
    const module = await import('../frontend/src/data.js');
    const sourceCharacters = module.CHARACTERS;
    let charactersToSync = sourceCharacters;
    if (Array.isArray(charIds) && charIds.length > 0) {
      charactersToSync = sourceCharacters.filter(c => charIds.includes(c.id));
    }

    if (isProd) {
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        for (const char of charactersToSync) {
          const existing = await client.query("SELECT * FROM characters WHERE id = $1", [char.id]);
          if (existing.rows.length === 0) {
            await client.query(
              `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills, "cardData", "cards", "characterId", "attributeId", "groupIds", "assetId")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)`,
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
                char.assetId || null
              ]
            );
          } else {
            const fieldsToUpdate = [];
            const values = [];
            let valIdx = 1;

            if (bio) {
              fieldsToUpdate.push(`name = $${valIdx++}`);
              values.push(char.name);
              fieldsToUpdate.push(`title = $${valIdx++}`);
              values.push(char.title);
              fieldsToUpdate.push(`rarity = $${valIdx++}`);
              values.push(char.rarity);
              fieldsToUpdate.push(`"group" = $${valIdx++}`);
              values.push(char.group);
              fieldsToUpdate.push(`type = $${valIdx++}`);
              values.push(char.type);
              fieldsToUpdate.push(`accentColor = $${valIdx++}`);
              values.push(char.accentColor);
              fieldsToUpdate.push(`image = $${valIdx++}`);
              values.push(char.image);
              fieldsToUpdate.push(`avatar = $${valIdx++}`);
              values.push(char.avatar);
            }
            if (stats) {
              fieldsToUpdate.push(`stats = $${valIdx++}::jsonb`);
              values.push(JSON.stringify(char.stats));
            }
            if (skills) {
              fieldsToUpdate.push(`skills = $${valIdx++}::jsonb`);
              values.push(JSON.stringify(char.skills));
            }
            if (full) {
              fieldsToUpdate.push(`image = $${valIdx++}`);
              values.push(char.image);
              fieldsToUpdate.push(`avatar = $${valIdx++}`);
              values.push(char.avatar);
              fieldsToUpdate.push(`"cardData" = $${valIdx++}::jsonb`);
              values.push(JSON.stringify(char.cardData || {}));
              fieldsToUpdate.push(`"cards" = $${valIdx++}::jsonb`);
              values.push(JSON.stringify(char.cards || []));
              fieldsToUpdate.push(`"characterId" = $${valIdx++}`);
              values.push(char.characterId || null);
              fieldsToUpdate.push(`"attributeId" = $${valIdx++}`);
              values.push(char.attributeId || null);
              fieldsToUpdate.push(`"groupIds" = $${valIdx++}::jsonb`);
              values.push(JSON.stringify(char.groupIds || []));
              fieldsToUpdate.push(`"assetId" = $${valIdx++}`);
              values.push(char.assetId || null);
            }

            if (fieldsToUpdate.length > 0) {
              values.push(char.id);
              await client.query(
                `UPDATE characters SET ${fieldsToUpdate.join(', ')} WHERE id = $${valIdx}`,
                values
              );
            }
          }
        }
        await client.query("COMMIT");

        const updatedList = await pgPool.query("SELECT * FROM characters");
        const mapped = updatedList.rows.map(row => ({
          id: row.id,
          name: row.name,
          title: row.title,
          rarity: row.rarity,
          group: row.group,
          type: row.type,
          accentColor: row.accentcolor !== undefined ? row.accentcolor : row.accentColor,
          image: row.image,
          avatar: row.avatar,
          stats: row.stats,
          skills: row.skills,
          cardData: row.cardData,
          cards: row.cards
        }));
        res.json({ success: true, characters: mapped });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else {
      const db = loadDB();
      if (!db.characters) db.characters = [];

      for (const char of charactersToSync) {
        const existingIdx = db.characters.findIndex(c => c.id === char.id);
        if (existingIdx === -1) {
          db.characters.push(char);
        } else {
          const existing = db.characters[existingIdx];
          if (bio) {
            existing.name = char.name;
            existing.title = char.title;
            existing.rarity = char.rarity;
            existing.group = char.group;
            existing.type = char.type;
            existing.accentColor = char.accentColor;
            existing.image = char.image;
            existing.avatar = char.avatar;
          }
          if (stats) {
            existing.stats = char.stats;
          }
          if (skills) {
            existing.skills = char.skills;
          }
          db.characters[existingIdx] = existing;
        }
      }
      saveDB(db);
      res.json({ success: true, characters: db.characters });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/characters/bulk', requireAdmin, async (req, res) => {
  const charactersList = req.body;
  if (!Array.isArray(charactersList)) {
    return res.status(400).json({ error: 'Body must be an array of characters' });
  }

  if (isProd) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM characters");
      
      for (const char of charactersList) {
        await client.query(
          `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills, "cardData", "cards", "characterId", "attributeId", "groupIds", "assetId")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)`,
          [
            char.id,
            char.name,
            char.title,
            char.rarity,
            char.group,
            char.type,
            char.accentColor || char.accent_color,
            char.image,
            char.avatar,
            JSON.stringify(char.stats),
            JSON.stringify(char.skills),
            JSON.stringify(char.cardData || {}),
            JSON.stringify(char.cards || []),
            char.characterId || null,
            char.attributeId || null,
            JSON.stringify(char.groupIds || []),
            char.assetId || null
          ]
        );
      }
      
      await client.query("COMMIT");
      res.json({ success: true, count: charactersList.length });
    } catch (err) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } else {
    const db = loadDB();
    db.characters = charactersList;
    saveDB(db);
    res.json({ success: true, count: charactersList.length });
  }
});

app.post('/api/admin/characters', requireAdmin, async (req, res) => {
  const char = req.body;
  if (!char.id || !char.name) {
    return res.status(400).json({ error: 'Character ID and Name are required' });
  }
  if (isProd) {
    try {
      await pgPool.query(
        `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills, "cardData", "cards", "characterId", "attributeId", "groupIds", "assetId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)`,
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
          JSON.stringify(char.stats || {}),
          JSON.stringify(char.skills || {}),
          JSON.stringify(char.cardData || {}),
          JSON.stringify(char.cards || []),
          char.characterId || null,
          char.attributeId || null,
          JSON.stringify(char.groupIds || []),
          char.assetId || null
        ]
      );
      res.status(201).json({ success: true, character: char });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    if (db.characters.some(c => c.id === char.id)) {
      return res.status(400).json({ error: 'Character ID already exists' });
    }
    db.characters.push(char);
    saveDB(db);
    res.status(201).json({ success: true, character: char });
  }
});

app.put('/api/admin/characters/:id', requireAdmin, async (req, res) => {
  const charId = req.params.id;
  const char = req.body;
  if (isProd) {
    try {
      const result = await pgPool.query(
        `UPDATE characters 
         SET name = $1, title = $2, rarity = $3, "group" = $4, type = $5, accentColor = $6, image = $7, avatar = $8, stats = $9::jsonb, skills = $10::jsonb
         WHERE id = $11`,
        [
          char.name,
          char.title,
          char.rarity,
          char.group,
          char.type,
          char.accentColor,
          char.image,
          char.avatar,
          JSON.stringify(char.stats || {}),
          JSON.stringify(char.skills || {}),
          charId
        ]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Character not found' });
      }
      res.json({ success: true, character: char });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    const idx = db.characters.findIndex(c => c.id === charId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Character not found' });
    }
    db.characters[idx] = { ...db.characters[idx], ...char, id: charId };
    saveDB(db);
    res.json({ success: true, character: db.characters[idx] });
  }
});

app.delete('/api/admin/characters/:id', requireAdmin, async (req, res) => {
  const charId = req.params.id;
  if (isProd) {
    try {
      const result = await pgPool.query("DELETE FROM characters WHERE id = $1", [charId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Character not found' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    const idx = db.characters.findIndex(c => c.id === charId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Character not found' });
    }
    db.characters.splice(idx, 1);
    saveDB(db);
    res.json({ success: true });
  }
});

// 2. Guides CRUD
app.post('/api/admin/guides', requireAdmin, async (req, res) => {
  const guide = req.body;
  if (!guide.id || !guide.title) {
    return res.status(400).json({ error: 'Guide ID and Title are required' });
  }
  if (isProd) {
    try {
      await pgPool.query(
        `INSERT INTO guides (id, title, summary, category, readTime, author, date, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          guide.id,
          guide.title,
          guide.summary,
          guide.category,
          guide.readTime,
          guide.author,
          guide.date,
          guide.content
        ]
      );
      res.status(201).json({ success: true, guide });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    if (db.guides.some(g => g.id === guide.id)) {
      return res.status(400).json({ error: 'Guide ID already exists' });
    }
    db.guides.push(guide);
    saveDB(db);
    res.status(201).json({ success: true, guide });
  }
});

app.put('/api/admin/guides/:id', requireAdmin, async (req, res) => {
  const guideId = req.params.id;
  const guide = req.body;
  if (isProd) {
    try {
      const result = await pgPool.query(
        `UPDATE guides 
         SET title = $1, summary = $2, category = $3, readTime = $4, author = $5, date = $6, content = $7
         WHERE id = $8`,
        [
          guide.title,
          guide.summary,
          guide.category,
          guide.readTime,
          guide.author,
          guide.date,
          guide.content,
          guideId
        ]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Guide not found' });
      }
      res.json({ success: true, guide });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    const idx = db.guides.findIndex(g => g.id === guideId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Guide not found' });
    }
    db.guides[idx] = { ...db.guides[idx], ...guide, id: guideId };
    saveDB(db);
    res.json({ success: true, guide: db.guides[idx] });
  }
});

app.delete('/api/admin/guides/:id', requireAdmin, async (req, res) => {
  const guideId = req.params.id;
  if (isProd) {
    try {
      const result = await pgPool.query("DELETE FROM guides WHERE id = $1", [guideId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Guide not found' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    const idx = db.guides.findIndex(g => g.id === guideId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Guide not found' });
    }
    db.guides.splice(idx, 1);
    saveDB(db);
    res.json({ success: true });
  }
});

// GET /api/docs (Official Swagger UI Sandbox)
app.get('/api/docs', (req, res) => {
  const openApiSpec = {
    openapi: "3.0.0",
    info: {
      title: "HoloDreams API",
      version: "1.0.0",
      description: "Interactive API documentation for Hololive Dreams talent records, team presets, and roster checklist managers."
    },
    servers: [
      {
        url: isProd ? "" : "http://localhost:5000",
        description: isProd ? "Current Server" : "Local Backend Server"
      }
    ],
    paths: {
      "/api/characters": {
        get: {
          summary: "Retrieve talent list",
          description: "Fetch all 54 Hololive talent cards with stats and skill descriptions.",
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/Character"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/presets": {
        get: {
          summary: "Retrieve team presets",
          description: "Retrieve all 5 team presets for the current device.",
          parameters: [
            {
              name: "x-device-id",
              in: "header",
              required: true,
              schema: {
                type: "string"
              },
              description: "Unique Device ID for partitioning data"
            }
          ],
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/Preset"
                    }
                  }
                }
              }
            }
          }
        },
        put: {
          summary: "Save team presets",
          description: "Update or insert presets for the current device.",
          parameters: [
            {
              name: "x-device-id",
              in: "header",
              required: true,
              schema: {
                type: "string"
              },
              description: "Unique Device ID for partitioning data"
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Preset"
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/roster": {
        get: {
          summary: "Retrieve owned roster IDs",
          description: "Retrieve the array of character IDs owned by the current device.",
          parameters: [
            {
              name: "x-device-id",
              in: "header",
              required: true,
              schema: {
                type: "string"
              },
              description: "Unique Device ID for partitioning data"
            }
          ],
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }
                }
              }
            }
          }
        },
        put: {
          summary: "Update owned roster IDs",
          description: "Update the array of character IDs owned by the current device.",
          parameters: [
            {
              name: "x-device-id",
              in: "header",
              required: true,
              schema: {
                type: "string"
              },
              description: "Unique Device ID for partitioning data"
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "string"
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/guides": {
        get: {
          summary: "Retrieve guide articles",
          description: "Fetch all guide articles for Hololive Dreams.",
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/Guide"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Character: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            title: { type: "string" },
            rarity: { type: "string" },
            group: { type: "string" },
            type: { type: "string" },
            accentColor: { type: "string" },
            image: { type: "string" },
            avatar: { type: "string" },
            stats: {
              type: "object",
              properties: {
                sense: { type: "integer" },
                technique: { type: "integer" },
                performance: { type: "integer" },
                support: { type: "integer" }
              }
            },
            skills: {
              type: "object",
              properties: {
                outfit: { type: "string" },
                special: { type: "string" },
                active: { type: "string" },
                passive: { type: "string" }
              }
            }
          }
        },
        Preset: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            team: {
              type: "array",
              items: {
                type: "string",
                nullable: true
              }
            },
            leader: {
              type: "string",
              nullable: true
            },
            isActive: { type: "boolean" }
          }
        },
        Guide: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            category: { type: "string" },
            readTime: { type: "string" },
            author: { type: "string" },
            date: { type: "string" },
            content: { type: "string" }
          }
        }
      }
    }
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HoloDreams API Docs</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"> </script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"> </script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        spec: ${JSON.stringify(openApiSpec)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout"
      });
      window.ui = ui;
    };
  </script>
</body>
</html>`;
  res.send(html);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend API Server running on port ${PORT}`);
});
