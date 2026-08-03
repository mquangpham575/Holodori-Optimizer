/**
 * HolodoriDB ETL & Snapshot Synchronization Script
 * Fetches the live BUNDLED_PACKED from int3rrupt3d/holodori-optimizer src/app.js.in,
 * converts normalized-card-v2 -> legacy snapshot, and enriches database.json
 * with exact card stats, skill level 1 vs level 2 texts, bloom stages, and songs.
 *
 * Usage: node backend/etl/sync-holodori-db.js [--force]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchPacked, packedToLegacySnapshot, enrichCharacters, packedContentHash } from "./holodori-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "database.json");
const SNAPSHOT_PATH = path.join(__dirname, "..", "holodori_snapshot.json");
const VERSION_CACHE_PATH = path.join(__dirname, "last_version.txt");

const BASE_URL = "https://raw.githubusercontent.com/HolodoriDB/holodori-db-eng-diff/main";

async function main() {
  console.log("\n=== HolodoriDB Snapshot ETL Sync ===\n");

  const force = process.argv.includes("--force");

  let snapshot;
  let versionChanged = false;
  if (force || !fs.existsSync(SNAPSHOT_PATH)) {
    console.log("Fetching latest BUNDLED_PACKED from holodori-optimizer src/app.js.in...");
    const packed = await fetchPacked();
    snapshot = packedToLegacySnapshot(packed);
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`  Saved snapshot (${snapshot.cards.length} cards, sourceVersion ${snapshot.sourceVersion}).\n`);

    const contentHash = packedContentHash(packed);
    const lastHash = fs.existsSync(VERSION_CACHE_PATH)
      ? fs.readFileSync(VERSION_CACHE_PATH, "utf8").trim()
      : null;
    versionChanged = lastHash !== contentHash;
    fs.writeFileSync(VERSION_CACHE_PATH, contentHash, "utf8");
  } else {
    console.log("Loading local normalized snapshot...");
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  }

  // Fetch Music.json for songs
  console.log("Fetching Music.json...");
  const musicRes = await fetch(`${BASE_URL}/Music.json`);
  if (!musicRes.ok) throw new Error(`Failed to fetch Music.json: HTTP ${musicRes.status}`);
  const musicData = await musicRes.json();

  const existingDB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

  const { characters: enrichedChars, skipped: skippedList } = enrichCharacters(existingDB.characters, snapshot);

  const enrichedById = new Map(enrichedChars.map(c => [c.id, c]));
  for (let i = 0; i < existingDB.characters.length; i++) {
    const enriched = enrichedById.get(existingDB.characters[i].id);
    if (enriched) existingDB.characters[i] = enriched;
  }

  skippedList.forEach(name => console.warn(`  WARNING: No snapshot card match for "${name}" — skipped`));

  const enriched = enrichedChars.length;
  const skipped = skippedList.length;

  process.stdout.write("\n");
  console.log(`\nEnrichment: ${enriched} characters updated with all card variants, ${skipped} skipped.\n`);

  console.log("Building songs list...");
  const songs = musicData
    .filter(m => m.data.playingSeconds > 0)
    .map(m => ({
      id: m.id,
      titleLangId: m.data.titleLangId,
      assetId: m.data.assetId,
      jacketAssetId: m.data.jacketAssetId,
      playingSeconds: m.data.playingSeconds,
      characterIds: m.data.characterIds || [],
      mvUrl: m.data.mvUrl || null,
      liveScoreCoefficientPermil: m.data.liveScoreCoefficientPermil || 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  existingDB.songs = songs;
  existingDB.allCards = snapshot.cards;
  existingDB.holodoriDbVersion = snapshot.sourceVersion || "v3.3";
  existingDB.holodoriDbSyncedAt = new Date().toISOString();

  fs.writeFileSync(DB_PATH, JSON.stringify(existingDB, null, 2), "utf8");

  console.log(`Done! ${enriched} characters enriched with ${snapshot.cards.length} cards${versionChanged ? " (VERSION CHANGED)" : ""}.`);
  console.log(`Indexed ${songs.length} songs.\n`);
}

main().catch(err => {
  console.error("\nETL failed:", err.message);
  process.exit(1);
});
