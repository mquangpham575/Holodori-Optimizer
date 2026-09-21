/**
 * Extracts the bundled card artworks from the holodori-optimizer site
 * (LOCAL_ARTWORK manifest embedded in index.html) into
 * frontend/public/images/cards/<assetId>.webp so the site can serve card
 * art locally instead of relying on the dead remote assetbundles URLs.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import config from "../config.js";
import { fetchOptimizerHtml } from "./holodori-sync.js";

// config.imagesDir = <repo>/frontend/public/images. This used to be a hand-rolled
// "../../frontend/..." relative to backend/src/etl, which resolves to
// backend/frontend/... since the backend/src split, so new card art was written
// somewhere the site never serves from.
export const ART_DIR = join(config.imagesDir, "cards");

export function extractLocalArtwork(src: string): any {
  const m = src.match(/LOCAL_ARTWORK = (\{[\s\S]*?\});\s*(?:var|let|const|function|\w)/);
  if (!m) throw new Error("LOCAL_ARTWORK manifest not found in index.html");
  return JSON.parse(m[1]);
}

export function decodeDataUri(src: string): { ext: string; data: Buffer } | null {
  const m = String(src || "").match(/^data:image\/([a-z]+);base64,(.+)$/);
  if (!m) return null;
  return { ext: m[1] === "jpeg" ? "jpg" : m[1], data: Buffer.from(m[2], "base64") };
}

export function getCardArtEntries(src: string): { entries: any[]; embeddedCardCount: number } {
  const manifest = extractLocalArtwork(src);
  const cards = manifest.cards || {};
  const entries: any[] = [];
  for (const card of Object.values(cards) as any[]) {
    const decoded = decodeDataUri(card.src);
    if (!decoded || !card.assetId) continue;
    entries.push({ assetId: card.assetId, ext: decoded.ext, data: decoded.data });
  }
  return { entries, embeddedCardCount: manifest.embeddedCardCount };
}

export async function writeCardArt(
  src: string,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<{ written: number; bytes: number; embeddedCardCount: number }> {
  const { entries, embeddedCardCount } = getCardArtEntries(src);
  if (!existsSync(ART_DIR) && !dryRun) mkdirSync(ART_DIR, { recursive: true });

  let written = 0;
  let bytes = 0;
  for (const entry of entries) {
    const target = join(ART_DIR, `${entry.assetId}.${entry.ext}`);
    bytes += entry.data.length;
    if (!dryRun) writeFileSync(target, entry.data);
    written++;
  }
  return { written, bytes, embeddedCardCount };
}

export const fetchIndexHtml = fetchOptimizerHtml;

const isMain =
  process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const html = await fetchIndexHtml();
  const { written, bytes, embeddedCardCount } = await writeCardArt(html);
  console.log(
    `Wrote ${written}/${embeddedCardCount} card artworks (${(bytes / 1048576).toFixed(2)} MB) to ${ART_DIR}`,
  );
}
