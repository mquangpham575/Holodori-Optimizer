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
app.use(express.json());

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

// JSON file database helpers
const loadDB = () => {
  if (!fs.existsSync(dbPath)) {
    return {
      characters: [],
      presets: [],
      roster: []
    };
  }
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading database.json:", err);
    return { characters: [], presets: [], roster: [] };
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
    
    // Create characters table
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

    // Create presets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team JSONB NOT NULL,
        leader TEXT,
        isActive BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    // Create roster table
    await client.query(`
      CREATE TABLE IF NOT EXISTS roster (
        id SERIAL PRIMARY KEY,
        owned_ids JSONB NOT NULL
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
    // 1. Seed characters
    const charCountResult = await client.query("SELECT COUNT(*) FROM characters");
    if (parseInt(charCountResult.rows[0].count) === 0) {
      console.log("Seeding characters into PostgreSQL...");
      const module = await import('../frontend/src/data.js');
      for (const char of module.CHARACTERS) {
        await client.query(
          `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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

    // 2. Seed presets
    const presetCountResult = await client.query("SELECT COUNT(*) FROM presets");
    if (parseInt(presetCountResult.rows[0].count) === 0) {
      console.log("Seeding presets into PostgreSQL...");
      const defaultPresets = [
        { id: 'preset_1', name: 'Preset 1', team: [null, null, null, null, null], leader: null, isActive: true },
        { id: 'preset_2', name: 'Preset 2', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_3', name: 'Preset 3', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_4', name: 'Preset 4', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_5', name: 'Preset 5', team: [null, null, null, null, null], leader: null, isActive: false }
      ];
      for (const p of defaultPresets) {
        await client.query(
          `INSERT INTO presets (id, name, team, leader, isActive) VALUES ($1, $2, $3, $4, $5)`,
          [p.id, p.name, JSON.stringify(p.team), p.leader, p.isActive]
        );
      }
      console.log("Presets seeded successfully in PostgreSQL!");
    }

    // 3. Seed roster
    const rosterCountResult = await client.query("SELECT COUNT(*) FROM roster");
    if (parseInt(rosterCountResult.rows[0].count) === 0) {
      console.log("Seeding default roster into PostgreSQL...");
      const module = await import('../frontend/src/data.js');
      const allIds = module.CHARACTERS.map(c => c.id);
      await client.query("INSERT INTO roster (owned_ids) VALUES ($1)", [JSON.stringify(allIds)]);
      console.log("Owned roster seeded successfully in PostgreSQL!");
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

    if (!db.presets || db.presets.length === 0) {
      console.log("Seeding default presets...");
      db.presets = [
        { id: 'preset_1', name: 'Preset 1', team: [null, null, null, null, null], leader: null, isActive: true },
        { id: 'preset_2', name: 'Preset 2', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_3', name: 'Preset 3', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_4', name: 'Preset 4', team: [null, null, null, null, null], leader: null, isActive: false },
        { id: 'preset_5', name: 'Preset 5', team: [null, null, null, null, null], leader: null, isActive: false }
      ];
      updated = true;
    }

    if (!db.roster || db.roster.length === 0) {
      console.log("Seeding default roster...");
      try {
        const module = await import('../frontend/src/data.js');
        db.roster = module.CHARACTERS.map(c => c.id);
        updated = true;
      } catch (err) {
        console.error("Error seeding default roster:", err);
      }
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
      res.json(result.rows);
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
  if (isProd) {
    try {
      const result = await pgPool.query("SELECT * FROM presets ORDER BY id ASC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    res.json(db.presets || []);
  }
});

// PUT /api/presets
app.put('/api/presets', async (req, res) => {
  const updatedPresets = req.body;
  if (!Array.isArray(updatedPresets)) {
    return res.status(400).json({ error: 'Body must be an array of presets' });
  }

  if (isProd) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      for (const p of updatedPresets) {
        await client.query(
          "UPDATE presets SET name = $1, team = $2, leader = $3, isActive = $4 WHERE id = $5",
          [p.name, JSON.stringify(p.team), p.leader, p.isActive, p.id]
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
    db.presets = updatedPresets;
    saveDB(db);
    res.json({ success: true });
  }
});

// GET /api/roster
app.get('/api/roster', async (req, res) => {
  if (isProd) {
    try {
      const result = await pgPool.query("SELECT owned_ids FROM roster LIMIT 1");
      if (result.rows.length === 0) return res.json([]);
      res.json(result.rows[0].owned_ids);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    res.json(db.roster || []);
  }
});

// PUT /api/roster
app.put('/api/roster', async (req, res) => {
  const ownedIds = req.body;
  if (!Array.isArray(ownedIds)) {
    return res.status(400).json({ error: 'Body must be an array of character IDs' });
  }

  if (isProd) {
    try {
      await pgPool.query("UPDATE roster SET owned_ids = $1 WHERE id = 1", [JSON.stringify(ownedIds)]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const db = loadDB();
    db.roster = ownedIds;
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
          description: "Retrieve all 5 team presets currently saved in the database.",
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
          description: "Update the 5 team presets configurations.",
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
          description: "Retrieve the array of character IDs currently checked as owned.",
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
          description: "Update the array of character IDs checked as owned.",
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
