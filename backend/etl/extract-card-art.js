/**
 * Extracts the bundled card artworks from the holodori-optimizer site
 * (LOCAL_ARTWORK manifest embedded in index.html) into
 * frontend/public/images/cards/<assetId>.webp so the site can serve card
 * art locally instead of relying on the dead remote assetbundles URLs.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const APP_JS_URL =
  "https://raw.githubusercontent.com/ace-ks-dev/holodori-optimizer/main/index.html";

const ART_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/public/images/cards",
);

export function extractLocalArtwork(src) {
  const m = src.match(/LOCAL_ARTWORK = (\{[\s\S]*?\});\s*(?:var|let|const|function|\w)/);
  if (!m) throw new Error("LOCAL_ARTWORK manifest not found in index.html");
  return JSON.parse(m[1]);
}

export function decodeDataUri(src) {
  const m = String(src || "").match(/^data:image\/([a-z]+);base64,(.+)$/);
  if (!m) return null;
  return { ext: m[1] === "jpeg" ? "jpg" : m[1], data: Buffer.from(m[2], "base64") };
}

export function getCardArtEntries(src) {
  const manifest = extractLocalArtwork(src);
  const cards = manifest.cards || {};
  const entries = [];
  for (const card of Object.values(cards)) {
    const decoded = decodeDataUri(card.src);
    if (!decoded || !card.assetId) continue;
    entries.push({ assetId: card.assetId, ext: decoded.ext, data: decoded.data });
  }
  return { entries, embeddedCardCount: manifest.embeddedCardCount };
}

export async function writeCardArt(src, { dryRun = false } = {}) {
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

export async function fetchIndexHtml() {
  const res = await fetch(APP_JS_URL);
  if (!res.ok) throw new Error(`Failed to fetch index.html: HTTP ${res.status}`);
  return res.text();
}

const isMain =
  process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const html = await fetchIndexHtml();
  const { written, bytes, embeddedCardCount } = await writeCardArt(html);
  console.log(
    `Wrote ${written}/${embeddedCardCount} card artworks (${(bytes / 1048576).toFixed(2)} MB) to ${ART_DIR}`,
  );
}
