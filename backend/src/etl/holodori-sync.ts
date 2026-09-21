/**
 * HolodoriDB live sync module.
 *
 * Fetches the optimizer's bundled card pack (BUNDLED_PACKED embedded in
 * src/app.js.in, normalized-card-v2), converts it to the legacy normalized
 * snapshot shape the site was built on, and enriches character rows for
 * PostgreSQL. Shared by:
 *   - backend/src/server.ts  (prod auto-sync on boot + interval)
 *   - backend/src/etl/sync-holodori-db.ts  (manual `--force` refresh of database.json)
 */

import { createHash } from "node:crypto";
import { logger } from "../logger.js";
import { fetchMasterTables, buildPackedFromMaster, MASTER_BASE_URL } from "./holodori-master.js";

// Upstream card-data source (also the reference for the optimizer logic).
const APP_JS_URL =
  "https://raw.githubusercontent.com/ace-ks-dev/holodori-optimizer/main/index.html";

export function packedContentHash(packed: any): string {
  return createHash("sha256").update(JSON.stringify(packed)).digest("hex");
}

// --- Fetching ------------------------------------------------------------

// index.html is ~23 MB; on a slow link 90 s is not enough, and a timeout here
// silently leaves the catalog stale (the caller only logs it). Configurable.
const FETCH_TIMEOUT_MS = Number(process.env.HOLODORI_FETCH_TIMEOUT_MS) || 300_000;
const HTML_CACHE_TTL_MS = 10 * 60 * 1000;
let htmlCache: { at: number; text: string; etag: string | null } | null = null;

// Both the card data and the card art come out of this one file, so a sync used
// to download it twice. Cache it briefly, then revalidate with If-None-Match so
// the 6-hourly check costs a 304 instead of 23 MB when nothing changed. Every
// request is bounded by a timeout (fetch has none by default, so a stalled
// connection would wedge the in-flight guard in syncHolodoriCards forever).
export async function fetchOptimizerHtml(): Promise<string> {
  if (htmlCache && Date.now() - htmlCache.at < HTML_CACHE_TTL_MS) return htmlCache.text;
  const res = await fetch(APP_JS_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: htmlCache?.etag ? { "If-None-Match": htmlCache.etag } : {},
  });
  if (res.status === 304 && htmlCache) {
    htmlCache.at = Date.now();
    return htmlCache.text;
  }
  if (!res.ok) throw new Error(`Failed to fetch optimizer index.html: HTTP ${res.status}`);
  const text = await res.text();
  htmlCache = { at: Date.now(), text, etag: res.headers.get("etag") };
  return text;
}

// Primary source: HolodoriDB master data converted directly (fresh within
// minutes of a master-data release, ~2 MB). Fallback: the optimizer's bundled
// pack, which only moves when that project publishes a release (and is a 23 MB
// download). Both produce the identical normalized-card-v2 shape.
export async function fetchPacked(): Promise<any> {
  try {
    const { version, tables } = await fetchMasterTables();
    const { packed, skipped } = buildPackedFromMaster(version, tables);
    if (skipped.length > 0) {
      logger.warn(
        { skipped },
        `HolodoriDB master: ${skipped.length} cards could not be converted and were left out`
      );
    }
    return packed;
  } catch (err) {
    logger.warn({ err }, "HolodoriDB master fetch/convert failed; falling back to the optimizer pack");
    return extractPacked(await fetchOptimizerHtml());
  }
}

const MUSIC_BASE_URL = MASTER_BASE_URL;

export async function fetchAndBuildSongs(): Promise<any[]> {
  const musicRes = await fetch(`${MUSIC_BASE_URL}/Music.json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!musicRes.ok) throw new Error(`Failed to fetch Music.json: HTTP ${musicRes.status}`);
  const musicData: any[] = await musicRes.json();
  return musicData
    .filter((m) => m.data.playingSeconds > 0)
    .map((m) => ({
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
}

export function extractPacked(src: string): any {
  const marker = "const BUNDLED_PACKED = ";
  const startIdx = src.indexOf(marker);
  if (startIdx < 0) throw new Error("BUNDLED_PACKED marker not found in app.js.in");
  const jsonStart = src.indexOf("{", startIdx + marker.length);
  if (jsonStart < 0) throw new Error("BUNDLED_PACKED opening brace not found");
  // Brace matching must ignore braces inside string literals (skill texts can
  // contain "{" / "}"), otherwise the slice ends early and JSON.parse fails.
  let depth = 0;
  let inString = false;
  let i = jsonStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error("BUNDLED_PACKED JSON not terminated");
  return JSON.parse(src.slice(jsonStart, i + 1));
}

// --- v2 (packed) -> legacy normalized snapshot ---------------------------

export function packedToLegacySnapshot(packed: any): any {
  const attrLabel = packed.attributeLabels || {};
  const groupLabel = packed.groupLabels || {};

  const convertCard = (card: any) => {
    const curve = packed.levelCurves?.[card.levelCurve];
    const profile = packed.bloomProfiles?.[card.bloomProfile] || [];
    return {
      id: card.id,
      assetId: card.assetId,
      characterId: card.characterId,
      member: card.member,
      name: card.name,
      key: `${card.member} | ${card.name}`,
      rarity: card.rarity,
      attributeId: card.attributeId,
      attribute: attrLabel[card.attributeId] || card.attribute || null,
      groupIds: card.groupIds || [],
      groupLabels: (card.groupIds || []).map((g: string) => groupLabel[g]).filter(Boolean),
      maxLevel: card.maxLevel,
      levelBaseValues: curve,
      statPermil: card.statPermil,
      levelLimitCaps: card.levelLimitCaps,
      bloomStages: profile.map((b: any, idx: number) => ({
        stage: b.stage ?? idx,
        statBonus: b.statBonus ?? 0,
        activeLevel: b.activeLevel,
        passiveLevel: b.passiveLevel,
        specialLevel: b.specialLevel,
        connectLevel: b.connectLevel ?? 1,
      })),
      activeLevels: card.activeLevels,
      passiveLevels: card.passiveLevels,
      specialLevels: card.specialLevels,
      outfit: card.outfit,
    };
  };

  return {
    schemaVersion: packed.schemaVersion,
    source: packed.source,
    sourceVersion: packed.sourceVersion,
    groupLabels: packed.groupLabels || {},
    attributeLabels: packed.attributeLabels || {},
    counts: packed.counts || {},
    cards: (packed.cards || []).map(convertCard),
  };
}

// --- Enrichment (legacy snapshot -> character rows) ----------------------

function computeStat(baseValue: number, permilWeight: number, bloomBonus: number): number {
  return Math.ceil(baseValue * (permilWeight / 1000) * (1 + bloomBonus));
}

const normalizeMember = (n: string): string => {
  if (!n) return "";
  let s = n.trim().replace(/\u2019/g, "'");
  if (s === "Mori Calliope") return "Calliope Mori";
  return s;
};

const attrTypeMap: Record<string, string> = {
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1: "CUTE",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2: "PURE",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3: "HAPPY",
  Happy: "HAPPY",
  Pure: "PURE",
  Cute: "CUTE",
};

export function enrichCharacters(baseCharacters: any[], snapshot: any) {
  const memberToCardsMap: Record<string, any[]> = {};
  snapshot.cards.forEach((card: any) => {
    const norm = normalizeMember(card.member);
    if (!memberToCardsMap[norm]) memberToCardsMap[norm] = [];
    memberToCardsMap[norm].push(card);
  });

  const enriched: any[] = [];
  const skipped: string[] = [];

  for (const char of baseCharacters) {
    const normName = normalizeMember(char.name);
    const memberCards = memberToCardsMap[normName] || [];

    const cards = memberCards.map((c: any) => {
      // Level curves are not all 80 long (4-star: 70, 3-star: 60). Indexing [79]
      // directly yielded undefined -> NaN -> null for every 3/4-star card, so
      // their max stats were blank in the database. Clamp to the last level.
      const curve: number[] = Array.isArray(c.levelBaseValues) ? c.levelBaseValues : [];
      const baseAtLevel = (lvl: number): number =>
        curve.length ? curve[Math.min(lvl, curve.length) - 1] : 23612;
      const lvl80Base = baseAtLevel(80);
      // Max stats assume the final Bloom stage; 5-star keeps its historical 10%.
      const finalStage = (c.bloomStages || [])[(c.bloomStages || []).length - 1];
      const node2Bonus = c.rarity === 5 ? 0.1 : finalStage?.statBonus ?? 0.0;
      const weights = c.statPermil || [333, 333, 334];

      const maxPerf = computeStat(lvl80Base, weights[0], node2Bonus);
      const maxTech = computeStat(lvl80Base, weights[1], node2Bonus);
      const maxSense = computeStat(lvl80Base, weights[2], node2Bonus);

      const type = attrTypeMap[c.attribute] || attrTypeMap[c.attributeId] || char.type;

      const bloomStats = (c.bloomStages || []).map((bs: any) => {
        const stage = bs.stage;
        const statBonus = bs.statBonus || 0;
        const levelCaps = [60, 65, 70, 75, 80, 80];
        const maxLvl = levelCaps[stage] || 80;
        const baseVal = baseAtLevel(maxLvl);
        const perf = computeStat(baseVal, weights[0], statBonus);
        const tech = computeStat(baseVal, weights[1], statBonus);
        const sense = computeStat(baseVal, weights[2], statBonus);
        return {
          stage,
          maxLevel: maxLvl,
          statBonus,
          activeLevel: bs.activeLevel,
          passiveLevel: bs.passiveLevel,
          specialLevel: bs.specialLevel,
          performance: perf,
          technique: tech,
          sense: sense,
          total: perf + tech + sense,
        };
      });

      return {
        id: c.id,
        title: c.name || char.title,
        rarity: c.rarity,
        type,
        assetId: c.assetId,
        stats: {
          performance: maxPerf,
          technique: maxTech,
          sense: maxSense,
          total: maxPerf + maxTech + maxSense,
        },
        bloomStats,
        skills: {
          active: c.activeLevels?.["2"]?.text || c.activeLevels?.["1"]?.text || char.skills?.active,
          passive: c.passiveLevels?.["2"]?.text || c.passiveLevels?.["1"]?.text || char.skills?.passive,
          special: c.specialLevels?.["2"]?.text || c.specialLevels?.["1"]?.text || char.skills?.special,
          outfit: c.outfit?.text || char.skills?.outfit,
          levels: {
            active: { "1": c.activeLevels?.["1"]?.text || "", "2": c.activeLevels?.["2"]?.text || "" },
            passive: { "1": c.passiveLevels?.["1"]?.text || "", "2": c.passiveLevels?.["2"]?.text || "" },
            special: { "1": c.specialLevels?.["1"]?.text || "", "2": c.specialLevels?.["2"]?.text || "" },
          },
        },
        cardData: c,
      };
    });

    const cardMatch =
      (char.cardData?.id && memberCards.find((c) => c.id === char.cardData.id)) ||
      memberCards.find((c) => c.rarity === 5) ||
      memberCards[0];

    if (!cardMatch) {
      skipped.push(char.name);
      continue;
    }

    const primaryVariant = cards.find((c) => c.id === cardMatch.id) || cards[0];

    enriched.push({
      ...char,
      title: cardMatch.name || char.title,
      assetId: cardMatch.assetId || char.assetId,
      characterId: cardMatch.characterId || char.characterId,
      image: cardMatch.assetId ? `/images/cards/${cardMatch.assetId}.webp` : char.image,
      type: attrTypeMap[cardMatch.attribute] || attrTypeMap[cardMatch.attributeId] || char.type,
      cardData: primaryVariant.cardData,
      stats: primaryVariant.stats,
      bloomStats: primaryVariant.bloomStats,
      skills: primaryVariant.skills,
      cards,
    });
  }

  return { characters: enriched, skipped };
}
