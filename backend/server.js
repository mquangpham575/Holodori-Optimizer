import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pkg from 'pg';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static images from frontend public folder
const imagesDir = path.join(__dirname, '../frontend/public/images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
app.use('/images', express.static(imagesDir));

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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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
      guides: []
    };
  }
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.presets)) parsed.presets = {};
    if (Array.isArray(parsed.roster)) parsed.roster = {};
    if (!parsed.guides) parsed.guides = [];
    return parsed;
  } catch (err) {
    console.error("Error reading database.json:", err);
    return { characters: [], presets: {}, roster: {}, guides: [] };
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

    // Recreate characters table once to apply total stats migration
    await client.query("DROP TABLE IF EXISTS characters CASCADE");

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
        skills JSONB NOT NULL
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

// PostgreSQL Seeding
const seedPostgres = async () => {
  const client = await pgPool.connect();
  try {
    // 1. Seed characters table
    const charCountResult = await client.query("SELECT COUNT(*) FROM characters");
    if (parseInt(charCountResult.rows[0].count) === 0) {
      console.log("Seeding characters into PostgreSQL...");
      const module = await import('../frontend/src/data.js');
      for (const char of module.CHARACTERS) {
        await client.query(
          `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
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
            JSON.stringify(char.skills)
          ]
        );
      }
      console.log("Characters seeded successfully in PostgreSQL!");
    }

    // 2. Seed guides table
    const guideCountResult = await client.query("SELECT COUNT(*) FROM guides");
    if (parseInt(guideCountResult.rows[0].count) === 0) {
      console.log("Seeding guides into PostgreSQL...");
      const module = await import('../frontend/src/data.js');
      for (const guide of module.GUIDES) {
        await client.query(
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
      }
      console.log("Guides seeded successfully in PostgreSQL!");
    }
  } catch (err) {
    console.error("Error seeding PostgreSQL:", err);
  } finally {
    client.release();
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

    console.log("Seeding characters from src/data.js...");
    try {
      const module = await import('../frontend/src/data.js');
      db.characters = module.CHARACTERS;
      updated = true;
    } catch (err) {
      console.error("Error importing data.js for seeding:", err);
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
        skills: row.skills
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
      res.json(result.rows);
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
app.post('/api/admin/characters', requireAdmin, async (req, res) => {
  const char = req.body;
  if (!char.id || !char.name) {
    return res.status(400).json({ error: 'Character ID and Name are required' });
  }
  if (isProd) {
    try {
      await pgPool.query(
        `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
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
          JSON.stringify(char.skills || {})
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
