/**
 * HolodoriDB live sync module.
 *
 * Fetches the optimizer's bundled card pack (BUNDLED_PACKED embedded in
 * src/app.js.in, normalized-card-v2), converts it to the legacy normalized
 * snapshot shape the site was built on, and enriches character rows for
 * PostgreSQL. Shared by:
 *   - backend/server.js  (prod auto-sync on boot + interval)
 *   - backend/etl/sync-holodori-db.js  (manual `--force` refresh of database.json)
 */

import { createHash } from "crypto";

const APP_JS_URL =
  "https://raw.githubusercontent.com/ace-ks-dev/holodori-optimizer/main/index.html";

export function packedContentHash(packed) {
  return createHash("sha256").update(JSON.stringify(packed)).digest("hex");
}

// --- Fetching ------------------------------------------------------------

export async function fetchPacked() {
  const res = await fetch(APP_JS_URL);
  if (!res.ok) throw new Error(`Failed to fetch app.js.in: HTTP ${res.status}`);
  const src = await res.text();
  return extractPacked(src);
}

const MUSIC_BASE_URL =
  "https://raw.githubusercontent.com/HolodoriDB/holodori-db-eng-diff/main";

export async function fetchAndBuildSongs() {
  const musicRes = await fetch(`${MUSIC_BASE_URL}/Music.json`);
  if (!musicRes.ok) throw new Error(`Failed to fetch Music.json: HTTP ${musicRes.status}`);
  const musicData = await musicRes.json();
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

export function extractPacked(src) {
  const marker = "const BUNDLED_PACKED = ";
  const startIdx = src.indexOf(marker);
  if (startIdx < 0) throw new Error("BUNDLED_PACKED marker not found in app.js.in");
  const jsonStart = src.indexOf("{", startIdx + marker.length);
  if (jsonStart < 0) throw new Error("BUNDLED_PACKED opening brace not found");
  let depth = 0;
  let i = jsonStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error("BUNDLED_PACKED JSON not terminated");
  return JSON.parse(src.slice(jsonStart, i + 1));
}

// --- v2 (packed) -> legacy normalized snapshot ---------------------------

export function packedToLegacySnapshot(packed) {
  const attrLabel = packed.attributeLabels || {};
  const groupLabel = packed.groupLabels || {};

  const convertCard = (card) => {
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
      groupLabels: (card.groupIds || []).map((g) => groupLabel[g]).filter(Boolean),
      maxLevel: card.maxLevel,
      levelBaseValues: curve,
      statPermil: card.statPermil,
      levelLimitCaps: card.levelLimitCaps,
      bloomStages: profile.map((b, idx) => ({
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

function computeStat(baseValue, permilWeight, bloomBonus) {
  return Math.ceil(baseValue * (permilWeight / 1000) * (1 + bloomBonus));
}

const normalizeMember = (n) => {
  if (!n) return "";
  let s = n.trim().replace(/\u2019/g, "'");
  if (s === "Mori Calliope") return "Calliope Mori";
  return s;
};

const attrTypeMap = {
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1: "HAPPY",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2: "PURE",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3: "CUTE",
  Happy: "HAPPY",
  Pure: "PURE",
  Cute: "CUTE",
};

export function enrichCharacters(baseCharacters, snapshot) {
  const memberToCardsMap = {};
  snapshot.cards.forEach((card) => {
    const norm = normalizeMember(card.member);
    if (!memberToCardsMap[norm]) memberToCardsMap[norm] = [];
    memberToCardsMap[norm].push(card);
  });

  const enriched = [];
  const skipped = [];

  for (const char of baseCharacters) {
    const normName = normalizeMember(char.name);
    const memberCards = memberToCardsMap[normName] || [];

    const cards = memberCards.map((c) => {
      const lvl80Base = c.levelBaseValues ? c.levelBaseValues[79] : 23612;
      const node2Bonus = c.rarity === 5 ? 0.1 : 0.0;
      const weights = c.statPermil || [333, 333, 334];

      const maxPerf = computeStat(lvl80Base, weights[0], node2Bonus);
      const maxTech = computeStat(lvl80Base, weights[1], node2Bonus);
      const maxSense = computeStat(lvl80Base, weights[2], node2Bonus);

      const type = attrTypeMap[c.attribute] || attrTypeMap[c.attributeId] || char.type;

      const bloomStats = (c.bloomStages || []).map((bs) => {
        const stage = bs.stage;
        const statBonus = bs.statBonus || 0;
        const levelCaps = [60, 65, 70, 75, 80, 80];
        const maxLvl = levelCaps[stage] || 80;
        const baseVal = c.levelBaseValues ? c.levelBaseValues[maxLvl - 1] || lvl80Base : lvl80Base;
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
