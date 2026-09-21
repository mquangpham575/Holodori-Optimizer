import {
  fetchPacked,
  packedToLegacySnapshot,
  enrichCharacters,
  packedContentHash,
  fetchAndBuildSongs,
} from "../etl/holodori-sync.js";
import fs from "node:fs";
import path from "node:path";
import { fetchIndexHtml, getCardArtEntries, ART_DIR } from "../etl/extract-card-art.js";
import { syncFullArt, type FullArtStore } from "../etl/card-art-cdn.js";
import config from "../config.js";
import { loadDB, saveDB } from "../db/jsonStore.js";
import {
  getPool,
  initPostgresSchema,
  seedPostgres,
  upsertSongsPG,
  upsertCardArtPG,
  postgresFullArtStore,
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

const ACCENT_BY_TYPE: Record<string, string> = { CUTE: "#ec4899", PURE: "#38bdf8", HAPPY: "#f59e0b" };
const ATTRIBUTE_LABEL_BY_TYPE: Record<string, string> = { CUTE: "Cute", PURE: "Pure", HAPPY: "Happy" };
const TYPE_BY_ATTRIBUTE_ID: Record<string, string> = {
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1: "CUTE",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2: "PURE",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3: "HAPPY",
};

// The group a member is filed under in the UI: their most specific regular
// group ("ID Gen 1" rather than the umbrella "Indonesia").
const primaryGroupId = (groupIds: string[]): string | undefined =>
  groupIds.find((id) => !groupIds.some((other) => other !== id && other.startsWith(`${id}-`))) ?? groupIds[0];

/**
 * One character row per member found in the snapshot, in the same shape the
 * catalog uses for hand-curated rows. Everything that depends on the cards
 * (title, stats, skills, art...) is filled in afterwards by enrichCharacters().
 */
export const buildSkeletonFromSnapshot = (snapshot: any): any[] => {
  const byMember = new Map<string, any[]>();
  for (const card of snapshot.cards) {
    const norm = normalizeMemberName(card.member);
    if (!norm) continue;
    if (!byMember.has(norm)) byMember.set(norm, []);
    byMember.get(norm)!.push(card);
  }
  const skeleton: any[] = [];
  for (const [name, cards] of byMember) {
    const card = cards.find((c) => c.rarity === 5) ?? cards[0];
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const type = TYPE_BY_ATTRIBUTE_ID[card.attributeId] ?? "HAPPY";
    const groupIds: string[] = card.groupIds || [];
    const groupId = primaryGroupId(groupIds);
    skeleton.push({
      id,
      characterId: card.characterId || null,
      name,
      title: card.name || "",
      rarity: "5-Star",
      rarityNum: 5,
      group: (groupId && snapshot.groupLabels?.[groupId]) || "",
      type,
      attribute: ATTRIBUTE_LABEL_BY_TYPE[type],
      attributeId: card.attributeId || null,
      groupIds,
      accentColor: ACCENT_BY_TYPE[type],
      image: card.assetId ? `/images/cards/${card.assetId}.webp` : "",
      fallbackImage: `/images/${id}.webp`,
      avatar: name.charAt(0).toUpperCase(),
      assetId: card.assetId || null,
      stats: { performance: 0, technique: 0, sense: 0, total: 0 },
      skills: { active: "", passive: "", special: "", outfit: "" },
      cardData: {},
      cards: [],
    });
  }
  return skeleton;
};

/** Members present in the snapshot that have no row in the catalog yet. */
export const findNewMembers = (existing: any[], snapshot: any): any[] => {
  const knownIds = new Set(existing.map((c) => c.characterId).filter(Boolean));
  const knownNames = new Set(existing.map((c) => normalizeMemberName(c.name)));
  const knownRowIds = new Set(existing.map((c) => c.id));
  return buildSkeletonFromSnapshot(snapshot).filter(
    (m) =>
      !(m.characterId && knownIds.has(m.characterId)) && !knownNames.has(m.name) && !knownRowIds.has(m.id)
  );
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

// Dev store for the mirrored illustrations: originals in cards-full/, grid
// thumbnails in cards-thumb/, revalidation info in cards-full/.meta.json. All of it
// is git-ignored (frontend/public/images/cards-*), like the bundled card art.
const devFullArtStore = (): FullArtStore => {
  const fullDir = path.join(config.imagesDir, "cards-full");
  const thumbDir = path.join(config.imagesDir, "cards-thumb");
  const squareDir = path.join(config.imagesDir, "cards-square");
  const metaFile = path.join(fullDir, ".meta.json");
  const readMeta = (): Record<string, { etag: string | null; checkedAt: number }> => {
    try {
      return JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch {
      return {};
    }
  };
  const writeMeta = (meta: Record<string, unknown>) => {
    fs.mkdirSync(fullDir, { recursive: true });
    fs.writeFileSync(metaFile, JSON.stringify(meta));
  };
  return {
    async known() {
      const meta = readMeta();
      // Only trust an entry whose files are still there.
      return new Map(
        Object.entries(meta).filter(
          ([id]) => fs.existsSync(path.join(fullDir, `${id}.webp`)) && fs.existsSync(path.join(thumbDir, `${id}.webp`))
        )
      );
    },
    async save(assetId, art) {
      fs.mkdirSync(fullDir, { recursive: true });
      fs.mkdirSync(thumbDir, { recursive: true });
      fs.writeFileSync(path.join(fullDir, `${assetId}.webp`), art.full);
      fs.writeFileSync(path.join(thumbDir, `${assetId}.webp`), art.thumb);
      if (art.square) {
        fs.mkdirSync(squareDir, { recursive: true });
        fs.writeFileSync(path.join(squareDir, `${assetId}.webp`), art.square);
      }
      writeMeta({ ...readMeta(), [assetId]: { etag: art.etag, checkedAt: Date.now() } });
    },
    async touch(assetId) {
      const meta = readMeta();
      if (meta[assetId]) writeMeta({ ...meta, [assetId]: { ...meta[assetId], checkedAt: Date.now() } });
    },
    async missingSquare() {
      return Object.keys(readMeta()).filter(
        (id) => fs.existsSync(path.join(fullDir, `${id}.webp`)) && !fs.existsSync(path.join(squareDir, `${id}.webp`))
      );
    },
    async loadFull(assetId) {
      try {
        return fs.readFileSync(path.join(fullDir, `${assetId}.webp`));
      } catch {
        return null;
      }
    },
    async saveSquare(assetId, square) {
      fs.mkdirSync(squareDir, { recursive: true });
      fs.writeFileSync(path.join(squareDir, `${assetId}.webp`), square);
    },
  };
};

// Full-size illustrations for every card, mirrored from the art CDN. Independent of
// the card-data hash on purpose: a card can exist long before its artwork does.
export const ensureFullArt = async (cards: any[]): Promise<void> => {
  if (!config.cardArtCdnBase) return;
  try {
    const ids = cards.map((c) => c.assetId).filter(Boolean) as string[];
    const store = config.isProd ? postgresFullArtStore() : devFullArtStore();
    const r = await syncFullArt(ids, store);
    if (r.saved || r.squared || r.failed || r.missing.length) {
      logger.info(
        `Card art mirror: ${r.saved} downloaded, ${r.squared} icons cut, ${r.unchanged} up to date, ${r.missing.length} not on the CDN, ${r.failed} failed.`
      );
    }
  } catch (err) {
    logger.error({ err }, "Card art mirror failed");
  }
};

// Fill in card artwork that is not stored yet. This is deliberately independent
// of the data hash: art comes from a different source than the card data
// (master data lands first; artwork only when the optimizer bundles it), so a
// new card can be in the catalog for days before its image exists anywhere we
// may legitimately read it. Until then /images/cards/<id>.webp falls back to
// the member's portrait (see images.routes.ts). With ETag revalidation this is
// a cheap 304 on the regular 6-hourly runs.
export const ensureCardArt = async (cards: any[]): Promise<void> => {
  if (!config.bundleArtEnabled) return;
  try {
    const wanted = [...new Set(cards.map((c) => c.assetId).filter(Boolean))] as string[];
    let missing: string[];
    if (config.isProd) {
      const res = await getPool().query("SELECT asset_id FROM card_art");
      const have = new Set<string>(res.rows.map((r: any) => r.asset_id));
      missing = wanted.filter((id) => !have.has(id));
    } else {
      missing = wanted.filter((id) => !fs.existsSync(path.join(ART_DIR, `${id}.webp`)));
    }
    if (missing.length === 0) return;

    const { entries } = getCardArtEntries(await fetchIndexHtml());
    const wantedSet = new Set(missing);
    const fill = entries.filter((e) => wantedSet.has(e.assetId) && e.ext === "webp");
    if (config.isProd) {
      await upsertCardArtPG(fill);
    } else {
      fs.mkdirSync(ART_DIR, { recursive: true });
      for (const e of fill) fs.writeFileSync(path.join(ART_DIR, `${e.assetId}.webp`), e.data);
    }
    const stillMissing = missing.length - fill.length;
    logger.info(
      `HolodoriDB sync: stored ${fill.length} card artworks` +
        (stillMissing > 0 ? `; ${stillMissing} cards have no artwork available yet (portrait fallback in use).` : ".")
    );
  } catch (err) {
    logger.error({ err }, "HolodoriDB sync: card art refresh failed");
  }
};

export const syncHolodoriCards = async (): Promise<void> => {
  if (config.cardDataSource === "none") {
    logger.info("HolodoriDB sync disabled (HOLODORI_DATA_SOURCE=none); serving the stored catalog as is.");
    return;
  }
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
          // The hash only proves we applied this pack at some point. Rows can
          // since have been reverted (old seed behaviour, admin bulk import,
          // restore from backup), so also verify the stored card count.
          const rowsRes = await client.query("SELECT * FROM characters");
          const expectedById = new Map(
            enrichCharacters(rowsRes.rows, snapshot).characters.map((c: any) => [c.id, c])
          );
          const cardCount = (c: any) => (Array.isArray(c?.cards) ? c.cards.length : 0);
          // Rows the pack has no match for are left untouched by the sync, so
          // they count as "expected" as-is.
          const have = rowsRes.rows.reduce((n: number, r: any) => n + cardCount(r), 0);
          const want = rowsRes.rows.reduce(
            (n: number, r: any) => n + cardCount(expectedById.get(r.id) ?? r),
            0
          );
          const newMembers = findNewMembers(rowsRes.rows, snapshot);
          if (have === want && newMembers.length === 0) {
            logger.info(`HolodoriDB sync: already up to date (${newVersion}).`);
            await ensureCardArt(snapshot.cards);
            await ensureFullArt(snapshot.cards);
            return;
          }
          logger.warn(
            `HolodoriDB sync: stored hash matches but DB has ${have}/${want} cards and ${newMembers.length} missing members; re-applying.`
          );
        }

        logger.info(`HolodoriDB sync: applying update (${newVersion}, hash ${newHash.slice(0, 12)})`);
        await client.query("BEGIN");
        // Members that debuted upstream since the catalog was seeded get a row first
        // so the enrichment below fills them like any other member.
        const existingRes = await client.query("SELECT * FROM characters");
        const newMembers = findNewMembers(existingRes.rows, snapshot);
        for (const m of newMembers) {
          await client.query(
            `INSERT INTO characters (id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills, "cardData", "cards", "characterId", "attributeId", "groupIds", "assetId")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)
             ON CONFLICT (id) DO NOTHING`,
            [
              m.id, m.name, m.title, m.rarity, m.group, m.type, m.accentColor, m.image, m.avatar,
              JSON.stringify(m.stats), JSON.stringify(m.skills), JSON.stringify(m.cardData),
              JSON.stringify(m.cards), m.characterId, m.attributeId, JSON.stringify(m.groupIds), m.assetId,
            ]
          );
        }
        if (newMembers.length > 0) {
          logger.info(`HolodoriDB sync: added ${newMembers.length} new members: ${newMembers.map((m) => m.name).join(", ")}`);
        }
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
      await ensureCardArt(snapshot.cards);
      await ensureFullArt(snapshot.cards);
    } else {
      const db = loadDB();
      if (db.holodoriPackedHash === newHash) {
        logger.info(`HolodoriDB sync: already up to date (${newVersion}).`);
        await ensureCardArt(snapshot.cards);
        await ensureFullArt(snapshot.cards);
        return;
      }

      logger.info(`HolodoriDB sync: applying update (${newVersion}, hash ${newHash.slice(0, 12)})`);
      let skeleton = db.characters || [];
      if (skeleton.length === 0) {
        logger.info("HolodoriDB sync: local store empty, bootstrapping skeleton from snapshot...");
        skeleton = buildSkeletonFromSnapshot(snapshot);
      } else {
        const added = findNewMembers(skeleton, snapshot);
        if (added.length > 0) {
          logger.info(`HolodoriDB sync: adding ${added.length} new members: ${added.map((m) => m.name).join(", ")}`);
          skeleton = [...skeleton, ...added];
        }
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
      await ensureCardArt(snapshot.cards);
      await ensureFullArt(snapshot.cards);
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
