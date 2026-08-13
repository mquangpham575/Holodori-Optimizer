import {
  fetchPacked,
  packedToLegacySnapshot,
  enrichCharacters,
  packedContentHash,
  fetchAndBuildSongs,
} from "../etl/holodori-sync.js";
import { fetchIndexHtml, getCardArtEntries, writeCardArt } from "../etl/extract-card-art.js";
import config from "../config.js";
import { loadDB, saveDB } from "../db/jsonStore.js";
import {
  getPool,
  initPostgresSchema,
  seedPostgres,
  upsertSongsPG,
  upsertCardArtPG,
} from "../db/postgres.js";
import { pruneDuplicateCharacters } from "../repositories/characterRepository.js";
import {
  getHolodoriHash,
  setHolodoriHash,
  recordSyncEvent,
} from "../repositories/appMetaRepository.js";
import { loadFrontendData } from "./dataLoader.js";
import { publishCatalogSynced } from "../kafka/producer.js";
import { logger } from "../logger.js";

export const normalizeMemberName = (n: string): string => {
  if (!n) return "";
  let s = n.trim().replace(/\u2019/g, "'");
  if (s === "Mori Calliope") return "Calliope Mori";
  return s;
};

export const buildSkeletonFromSnapshot = (snapshot: any): any[] => {
  const seen = new Set<string>();
  const skeleton: any[] = [];
  for (const card of snapshot.cards) {
    const norm = normalizeMemberName(card.member);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    skeleton.push({
      id: norm.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: norm,
      title: card.name || "",
      rarity: "5",
      group: "",
      type: "HAPPY",
      accentColor: "#ffffff",
      image: card.assetId ? `/images/cards/${card.assetId}.webp` : "",
      avatar: "",
      stats: { performance: 0, technique: 0, sense: 0, total: 0 },
      skills: { active: "", passive: "", special: "", outfit: "" },
      cardData: {},
      cards: [],
      characterId: card.characterId || null,
      attributeId: card.attributeId || null,
      assetId: card.assetId || null,
    });
  }
  return skeleton;
};

export const bootstrapFromHolodori = async (): Promise<{
  characters: any[];
  skipped: string[];
}> => {
  const packed = await fetchPacked();
  const snapshot = packedToLegacySnapshot(packed);
  const skeleton = buildSkeletonFromSnapshot(snapshot);
  return enrichCharacters(skeleton, snapshot);
};

// HolodoriDB live card sync: applies upstream card updates to the active store
// (Postgres in prod, database.json locally) and publishes catalog.synced.
let holodoriSyncInFlight = false;

export const syncHolodoriCards = async (): Promise<void> => {
  if (holodoriSyncInFlight) return;
  holodoriSyncInFlight = true;
  try {
    const packed = await fetchPacked();
    const newHash = packedContentHash(packed);
    const newVersion = packed.sourceVersion;
    if (!newVersion) throw new Error("BUNDLED_PACKED has no sourceVersion");
    const snapshot = packedToLegacySnapshot(packed);

    let changed = false;

    if (config.isProd) {
      const client = await getPool().connect();
      try {
        const currentHash = await getHolodoriHash(client);
        if (currentHash === newHash) {
          logger.info(`HolodoriDB sync: already up to date (${newVersion}).`);
          return;
        }

        logger.info(`HolodoriDB sync: applying update (${newVersion}, hash ${newHash.slice(0, 12)})`);
        await client.query("BEGIN");
        const skeletonRes = await client.query("SELECT * FROM characters");
        const { characters, skipped } = enrichCharacters(skeletonRes.rows, snapshot);
        if (skipped.length > 0) {
          logger.warn(`HolodoriDB sync: no card match for ${skipped.length} characters, left unchanged: ${skipped.join(", ")}`);
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
              char.assetId || null,
            ]
          );
        }

        // Prune legacy rows (old ids) that duplicate an active source characterId.
        const sourceChars = loadDB().characters || [];
        const srcIds = sourceChars.map((c) => c.id);
        const srcMemberIds = sourceChars
          .map((c) => c.characterId)
          .filter((id): id is string => Boolean(id));
        await pruneDuplicateCharacters(client, srcIds, srcMemberIds);

        await setHolodoriHash(client, newHash, newVersion);
        await client.query("COMMIT");
        logger.info(`HolodoriDB sync: applied upstream update for ${characters.length} characters (${newVersion}).`);
        changed = true;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      try {
        const songs = await fetchAndBuildSongs();
        await upsertSongsPG(songs);
        logger.info(`HolodoriDB sync: refreshed ${songs.length} songs.`);
      } catch (err) {
        logger.error({ err }, "HolodoriDB sync: song refresh failed");
      }
      try {
        const html = await fetchIndexHtml();
        const { entries } = getCardArtEntries(html);
        await upsertCardArtPG(entries);
        logger.info(`HolodoriDB sync: refreshed ${entries.length} card artworks.`);
      } catch (err) {
        logger.error({ err }, "HolodoriDB sync: card art refresh failed");
      }
    } else {
      const db = loadDB();
      if (db.holodoriPackedHash === newHash) {
        logger.info(`HolodoriDB sync: already up to date (${newVersion}).`);
        return;
      }

      logger.info(`HolodoriDB sync: applying update (${newVersion}, hash ${newHash.slice(0, 12)})`);
      let skeleton = db.characters || [];
      if (skeleton.length === 0) {
        logger.info("HolodoriDB sync: local store empty, bootstrapping skeleton from snapshot...");
        skeleton = buildSkeletonFromSnapshot(snapshot);
      }

      const { characters, skipped } = enrichCharacters(skeleton, snapshot);
      if (skipped.length > 0) {
        logger.warn(`HolodoriDB sync: no card match for ${skipped.length} characters, left unchanged: ${skipped.join(", ")}`);
      }

      const enrichedById = new Map(characters.map((c: any) => [c.id, c]));
      const merged = skeleton.map((c) => enrichedById.get(c.id) || c);

      db.characters = merged;
      db.holodoriPackedHash = newHash;
      db.holodoriSourceVersion = newVersion;
      db.holodoriSyncedAt = new Date().toISOString();
      try {
        db.songs = await fetchAndBuildSongs();
      } catch (err) {
        logger.error({ err }, "HolodoriDB sync: song refresh failed");
      }
      saveDB(db);
      logger.info(`HolodoriDB sync: applied upstream update for ${merged.length} characters (${newVersion}).`);
      try {
        const html = await fetchIndexHtml();
        const { written, embeddedCardCount } = await writeCardArt(html);
        logger.info(`HolodoriDB sync: refreshed ${written}/${embeddedCardCount} card artworks.`);
      } catch (err) {
        logger.error({ err }, "HolodoriDB sync: card art refresh failed");
      }
      changed = true;
    }

    if (changed) {
      const payload = { version: newVersion, hash: newHash, source: config.isProd ? "postgres" : "json" };
      if (config.isProd) {
        await recordSyncEvent("catalog.synced", payload);
      }
      await publishCatalogSynced(payload);
    }
  } catch (err) {
    logger.error({ err }, "HolodoriDB sync failed");
  } finally {
    holodoriSyncInFlight = false;
  }
};

// Database Seeding Coordinator
export const seedDatabase = async (): Promise<void> => {
  if (config.isProd) {
    try {
      await initPostgresSchema();
      await seedPostgres();
    } catch (err) {
      logger.error({ err }, "Could not initialize PostgreSQL database. Falling back to local files.");
    }
  } else {
    const db = loadDB();
    let updated = false;

    if (!db.characters || db.characters.length === 0) {
      logger.info("Bootstrapping characters from HolodoriDB...");
      try {
        const { characters } = await bootstrapFromHolodori();
        if (characters.length > 0) {
          db.characters = characters;
          updated = true;
        }
      } catch (err) {
        logger.error({ err }, "HolodoriDB bootstrap failed");
      }
      if (!db.characters || db.characters.length === 0) {
        logger.info("Falling back to src/data.js for character seeding...");
        try {
          const module = await loadFrontendData();
          db.characters = module.CHARACTERS;
          updated = true;
        } catch (err) {
          logger.error({ err }, "Error importing data.js for seeding");
        }
      }
    }
    if (!db.guides || db.guides.length === 0) {
      logger.info("Seeding guides from src/data.js...");
      try {
        const module = await loadFrontendData();
        db.guides = module.GUIDES;
        updated = true;
      } catch (err) {
        logger.error({ err }, "Error seeding guides");
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
      logger.info("Database successfully seeded!");
    }
  }
};
