/**
 * HolodoriDB ETL & Snapshot Synchronization Script
 * Fetches the live card pack (HolodoriDB master tables, optimizer bundle as the
 * fallback; see HOLODORI_DATA_SOURCE), converts normalized-card-v2 -> legacy
 * snapshot, and enriches database.json
 * with exact card stats, skill level 1 vs level 2 texts, bloom stages, and songs.
 *
 * Usage: npx tsx backend/src/etl/sync-holodori-db.ts [--force]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../config.js";
import { fetchPacked, packedToLegacySnapshot, enrichCharacters, packedContentHash, fetchAndBuildSongs } from "./holodori-sync.js";
import { fetchIndexHtml, writeCardArt } from "./extract-card-art.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/etl (or dist/etl) -> backend. The old "..": backend/src (or backend/dist),
// where database.json does not exist, so `--force` always died with ENOENT.
const BACKEND_ROOT = path.join(__dirname, "..", "..");
const DB_PATH = config.dbPath;
const SNAPSHOT_PATH = path.join(BACKEND_ROOT, "holodori_snapshot.json");
const VERSION_CACHE_PATH = path.join(BACKEND_ROOT, "last_version.txt");

function atomicWrite(target: string, data: string, options: any) {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, options);
  fs.renameSync(tmp, target);
}

async function main() {
  console.log("\n=== HolodoriDB Snapshot ETL Sync ===\n");

  const force = process.argv.includes("--force");

  let snapshot: any;
  let versionChanged = false;
  let contentHash: string | null = null;
  if (force || !fs.existsSync(SNAPSHOT_PATH)) {
    console.log("Fetching the latest card pack...");
    const packed = await fetchPacked();
    snapshot = packedToLegacySnapshot(packed);
    atomicWrite(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`  Saved snapshot (${snapshot.cards.length} cards, sourceVersion ${snapshot.sourceVersion}).\n`);

    contentHash = packedContentHash(packed);
    const lastHash = fs.existsSync(VERSION_CACHE_PATH)
      ? fs.readFileSync(VERSION_CACHE_PATH, "utf8").trim()
      : null;
    versionChanged = lastHash !== contentHash;
    atomicWrite(VERSION_CACHE_PATH, contentHash, "utf8");

    // Refresh bundled card artworks (kept in frontend/public/images/cards)
    const html = await fetchIndexHtml();
    const { written, embeddedCardCount } = await writeCardArt(html);
    console.log(`  Refreshed card artworks (${written}/${embeddedCardCount}).\n`);
  } else {
    console.log("Loading local normalized snapshot...");
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  }

  // Fetch Music.json for songs
  console.log("Fetching Music.json...");
  const songs = await fetchAndBuildSongs();

  const existingDB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

  const { characters: enrichedChars, skipped: skippedList } = enrichCharacters(existingDB.characters, snapshot);

  const enrichedById = new Map(enrichedChars.map((c: any) => [c.id, c]));
  for (let i = 0; i < existingDB.characters.length; i++) {
    const enriched = enrichedById.get(existingDB.characters[i].id);
    if (enriched) existingDB.characters[i] = enriched;
  }

  skippedList.forEach((name: string) => console.warn(`  WARNING: No snapshot card match for "${name}" ? skipped`));

  const enriched = enrichedChars.length;
  const skipped = skippedList.length;

  process.stdout.write("\n");
  console.log(`\nEnrichment: ${enriched} characters updated with all card variants, ${skipped} skipped.\n`);

  console.log("Building songs list...");

  existingDB.songs = songs;
  existingDB.allCards = snapshot.cards;
  existingDB.holodoriSyncedAt = new Date().toISOString();
  existingDB.holodoriPackedHash = contentHash || (fs.existsSync(VERSION_CACHE_PATH) ? fs.readFileSync(VERSION_CACHE_PATH, "utf8").trim() : undefined) || null;
  existingDB.holodoriSourceVersion = snapshot.sourceVersion || null;

  atomicWrite(DB_PATH, JSON.stringify(existingDB, null, 2), "utf8");

  console.log(`Done! ${enriched} characters enriched with ${snapshot.cards.length} cards${versionChanged ? " (VERSION CHANGED)" : ""}.`);
  console.log(`Indexed ${songs.length} songs.\n`);
}

main().catch((err) => {
  console.error("\nETL failed:", err.message);
  process.exit(1);
});
