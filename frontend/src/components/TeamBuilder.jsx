import { useLanguage } from "../context/LanguageContext";
import { useState, useRef } from "react";
import {
  Trash2,
  Users,
  AlertCircle,
  CheckCircle2,
  Award,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Search,
} from "lucide-react";
import "./TeamBuilder.css";
import "./CharacterDB.css";
import { ALL_CARDS } from "../data";
import { cardArtUrl } from "../allCards";
import searchWorkerSource from "../search_worker.js?raw";
import { findChar, sameChar, getTypeIconUrl } from "../charUtils";

// Intent: Collect every group label a character belongs to (single `group` field
// plus cardData groupLabels) so multi-group members like Fubuki (GAMERS + Gen 1)
// are matched by every group trigger. Returns an upper-cased Set.
const getCharGroupLabels = (char) => {
  const labels = new Set();
  if (!char) return labels;
  if (char.group) labels.add(String(char.group).toUpperCase());
  const collect = (labelsList) => {
    (Array.isArray(labelsList) ? labelsList : []).forEach((l) => {
      if (l) labels.add(String(l).toUpperCase());
    });
  };
  collect(char.groupLabels);
  collect(char.cardData?.groupLabels);
  if (Array.isArray(char.cards)) {
    char.cards.forEach((cv) => collect(cv?.cardData?.groupLabels));
  }
  return labels;
};

// Intent: Resolve specific card variant from character's available cards list (or return character primary card)
const getEffectiveCardVariant = (c, cardId) => {
  if (!c) return null;
  if (cardId && Array.isArray(c.cards) && c.cards.length > 0) {
    const match = c.cards.find((variant) => variant.id === cardId);
    if (match) return { ...c, ...match, originalCharId: c.id };
  }
  return c;
};

// Intent: Get skill text for a given bloom stage (supporting Lv. 1 vs Lv. 2 skill text)
const getSkillTextForStage = (c, skillType, bloomStage = 0) => {
  if (!c || !c.skills) return "";
  const stage = bloomStage !== undefined ? bloomStage : 0;
  if (c.skills.levels && c.skills.levels[skillType]) {
    if (skillType === "active")
      return c.skills.levels.active[stage >= 1 ? "2" : "1"] || c.skills.active;
    if (skillType === "passive")
      return (
        c.skills.levels.passive[stage >= 4 ? "2" : "1"] || c.skills.passive
      );
    if (skillType === "special")
      return (
        c.skills.levels.special[stage >= 3 ? "2" : "1"] || c.skills.special
      );
  }
  return c.skills[skillType] || "";
};

// Reference weights from int3rrupt3d/holodori-optimizer (positional by team slot)
const COMBO_SPECIAL_WEIGHTS = [
  0.894342157744536, 1.1912388493878143, 1.4104057162046644, 1.5165205256249472,
  1.062966970534175,
];
const NEUTRAL_SPECIAL_WEIGHTS = [1, 1, 1, 1, 1];

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// HOLODORI OPTIMIZER -EXACT SCORING ENGINE
// Ported directly from the official worker.js (holodori-optimizer on GitHub)
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

const SONG = 140; // song duration in seconds
const WORDS = Math.ceil(SONG / 32); // 32-bit words for bitmask

// Intent: For a card at a given bloom stage, resolve which skill tier (level 1 or 2) applies
const resolveSkillLevel = (char, skillType, bloomStage) => {
  const cd = char?.cardData || char;
  if (!cd || !cd.bloomStages) return null;
  const stage = bloomStage !== undefined ? bloomStage : 0;
  const bs = cd.bloomStages.find((s) => s.stage === stage) || cd.bloomStages[0];
  if (!bs) return null;
  if (skillType === "active")
    return cd.activeLevels?.[String(bs.activeLevel)] || null;
  if (skillType === "passive")
    return cd.passiveLevels?.[String(bs.passiveLevel)] || null;
  if (skillType === "special")
    return cd.specialLevels?.[String(bs.specialLevel)] || null;
  if (skillType === "outfit") return cd.outfit || null;
  return null;
};

// Intent: Materialize a team card with all pre-parsed skill data, stats, and bitmask
const materializeCard = (char, bloomStage, cardLevel) => {
  const cd = char?.cardData || char;
  const bloom = bloomStage !== undefined ? bloomStage : 0;
  // 3-star cards top out at level 60 and 4-star at 70; indexing their (shorter)
  // level curve at the default level 70 gave undefined -> NaN stats.
  const curveLength = Array.isArray(cd?.levelBaseValues) ? cd.levelBaseValues.length : 80;
  const lvl = Math.max(1, Math.min(80, curveLength || 80, cardLevel || 70));

  // Stats from levelBaseValues + statPermil + bloom statBonus
  let perf, tech, sense, total;
  if (cd && cd.levelBaseValues && cd.statPermil) {
    const bStageData =
      cd.bloomStages?.find((s) => s.stage === bloom) || cd.bloomStages?.[0];
    const statBonus = bStageData?.statBonus || 0;
    const baseVal = cd.levelBaseValues[lvl - 1];
    const perm = cd.statPermil;
    perf = Math.ceil(((baseVal * perm[0]) / 1000) * (1 + statBonus));
    tech = Math.ceil(((baseVal * perm[1]) / 1000) * (1 + statBonus));
    sense = Math.ceil(((baseVal * perm[2]) / 1000) * (1 + statBonus));
    total = perf + tech + sense;
  } else {
    // Fallback: approximate from max stats
    const maxTotal = char.stats?.total || 25974;
    const approxBase = Math.round(5200 + ((lvl - 1) * (maxTotal - 5200)) / 79);
    const statBonus = bloom >= 2 ? 0.1 : 0.0;
    perf = Math.ceil(
      approxBase *
        ((char.stats?.performance || maxTotal / 3) / maxTotal) *
        (1 + statBonus),
    );
    tech = Math.ceil(
      approxBase *
        ((char.stats?.technique || maxTotal / 3) / maxTotal) *
        (1 + statBonus),
    );
    sense = Math.ceil(
      approxBase *
        ((char.stats?.sense || maxTotal / 3) / maxTotal) *
        (1 + statBonus),
    );
    total = perf + tech + sense;
  }

  const active = resolveSkillLevel(char, "active", bloom) || {
    baseMagnitude: 75,
    conditionalMagnitude: null,
    trigger: null,
    duration: 10,
    interval: 30,
    probability: 0.46,
  };
  const passive = resolveSkillLevel(char, "passive", bloom);
  const special = resolveSkillLevel(char, "special", bloom) || {
    magnitude: 120,
    duration: 10,
    sarPct: 0,
    sarTrigger: null,
  };
  const outfit = resolveSkillLevel(char, "outfit", bloom);

  // Build active skill bitmask (1-indexed seconds)
  const mask = new Uint32Array(WORDS);
  const d = active.duration,
    iv = active.interval;
  if (d > 0 && iv > 0) {
    for (let t = 1; t <= SONG; t++) {
      if (t >= iv && t % iv < d) {
        const z = t - 1;
        mask[z >>> 5] |= 1 << (z & 31);
      }
    }
  }

  // Group and attribute membership
  const GROUP_MAP = {
    "Gen 0": "grp-gen_0",
    "Gen 1": "grp-gen_1",
    "Gen 2": "grp-gen_2",
    GAMERS: "grp-gamers",
    "Gen 3": "grp-gen_3",
    "Gen 4": "grp-gen_4",
    "Gen 5": "grp-gen_5",
    holoX: "grp-holox",
    "ID Gen 1": "grp-indonesia-gen_1",
    "ID Gen 2": "grp-indonesia-gen_2",
    "ID Gen 3": "grp-indonesia-gen_3",
    Myth: "grp-myth",
    Promise: "grp-promise",
    Advent: "grp-advent",
    ReGLOSS: "grp-regloss",
  };
  // Verified from database.json passive/active trigger IDs — CUTE=1, PURE=2, HAPPY=3
  const ATTR_MAP = {
    CUTE: "CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1",
    PURE: "CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2",
    HAPPY: "CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3",
    COOL: "CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1",
    ACTIVE: "CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3",
  };

  const groupId =
    char.groupIds?.[0] ||
    GROUP_MAP[char.group] ||
    `grp-${(char.group || "").toLowerCase().replace(/\s+/g, "_")}`;
  // A Holomem can belong to multiple groups (e.g. Fubuki = GAMERS + Gen 1);
  // carry ALL group ids so eligibility masks match every group trigger.
  const groupIds = Array.from(
    new Set([...(char.groupIds || []), ...(char.cardData?.groupIds || [])]),
  );
  const attributeId =
    char.attributeId ||
    (char.type
      ? ATTR_MAP[char.type]
      : char.attribute
        ? ATTR_MAP[char.attribute.toUpperCase()]
        : "CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2");
  const memberName = char.member || char.name;

  return {
    id: char.id,
    member: memberName,
    groupId,
    groupIds,
    attributeId,
    perf,
    tech,
    sense,
    total,
    active,
    passive,
    special,
    outfit,
    mask,
    bloom,
    level: lvl,
  };
};

// Intent: Build a reference-engine-shaped card (search_worker.js format) from
// a character's cardData so the vendored reference search can score it directly.
// Stats/skills are bit-identical to reference materializeCard for the same level/bloom.
const materializeReferenceCard = (char, bloomStage, cardLevel) => {
  const cd = char?.cardData;
  if (!cd || !cd.levelBaseValues || !cd.statPermil || !cd.bloomStages)
    return null;
  const bloom = Math.max(0, Math.min(5, Math.round(Number(bloomStage) || 0)));
  const level = Math.max(
    1,
    Math.min(
      cd.maxLevel || 80,
      Math.round(Number(cardLevel) || cd.maxLevel || 70),
    ),
  );
  const stage = cd.bloomStages[bloom];
  const base = cd.levelBaseValues[level - 1];
  const mult = 1 + (stage?.statBonus || 0);
  const stats = cd.statPermil.map((p) => Math.ceil(((base * p) / 1000) * mult));
  const active = structuredClone(cd.activeLevels?.[String(stage?.activeLevel)]);
  const passive = structuredClone(
    cd.passiveLevels?.[String(stage?.passiveLevel)],
  );
  const special = structuredClone(
    cd.specialLevels?.[String(stage?.specialLevel)],
  );
  if (active && Number(active.interval) > 0) {
    active.baseInterval = Number(active.interval);
    active.boardActiveFrequencyNodes = 0;
    active.boardActiveFrequencyPct = 0;
  }
  return {
    id: cd.id,
    assetId: cd.assetId || null,
    key: cd.key || cd.id,
    displayKey: `${cd.rarity}*${cd.member} | ${cd.name}`,
    member: cd.member,
    skin: cd.name,
    characterId: cd.characterId,
    rarity: cd.rarity,
    attributeId: cd.attributeId,
    type: cd.attribute,
    groupIds: [...(cd.groupIds || [])],
    generation: cd.generation || "",
    perf: stats[0],
    tech: stats[1],
    sense: stats[2],
    total: stats[0] + stats[1] + stats[2],
    level,
    bloom,
    maxLevel: cd.maxLevel || 80,
    boardActiveFrequencyNodes: 0,
    boardActiveFrequencyPct: 0,
    passive,
    outfit: structuredClone(cd.outfit),
    active,
    special,
  };
};

// Intent: Build per-card eligibility bitmasks for fast group/attribute membership lookup
const buildEligibility = (cards) => {
  const idMap = new Map();
  let nextCode = 0;
  const code = (id) => {
    if (!id) return -1;
    if (!idMap.has(id)) idMap.set(id, nextCode++);
    return idMap.get(id);
  };

  const registerEligibility = (x) => {
    if (x && (x.kind === "attribute" || x.kind === "group")) code(x.id);
  };
  cards.forEach((c) => {
    code(c.attributeId);
    const cgids = c.groupIds?.length ? c.groupIds : [c.groupId];
    cgids.forEach((g) => code(g));
    registerEligibility(c.active?.trigger);
    if (c.passive) {
      registerEligibility(c.passive.target);
      registerEligibility(c.passive.trigger);
    }
    registerEligibility(c.special?.sarTrigger);
    (c.outfit?.effects || []).forEach((e) => registerEligibility(e.trigger));
  });

  const words = Math.max(1, Math.ceil(idMap.size / 32));
  cards.forEach((c) => {
    const ew = new Uint32Array(words);
    const setElig = (id) => {
      const ci = idMap.get(id);
      if (ci !== undefined) ew[ci >>> 5] |= 1 << (ci & 31);
    };
    setElig(c.attributeId);
    (c.groupIds?.length ? c.groupIds : [c.groupId]).forEach((g) => setElig(g));
    c._ew = ew;
  });

  const annotate = (x) => {
    if (!x || (x.kind !== "attribute" && x.kind !== "group")) return;
    const ci = idMap.get(x.id);
    if (ci !== undefined) {
      x._w = ci >>> 5;
      x._b = 1 << (ci & 31);
    }
  };
  cards.forEach((c) => {
    annotate(c.active?.trigger);
    if (c.passive) {
      annotate(c.passive.target);
      annotate(c.passive.trigger);
    }
    annotate(c.special?.sarTrigger);
    (c.outfit?.effects || []).forEach((e) => annotate(e.trigger));
  });
};


// Intent: Test if a card matches a target descriptor.
// Membership is computed directly from the card's attributeId/groupIds — equivalent
// to the reference engine's global eligibility bitmask, but immune to stale per-call
// mask annotation (external/standalone leaders never pass through buildEligibility).
const cardMatchesTarget = (card, target) => {
  if (!target) return false;
  if (target.kind === "all") return true;
  if (target.kind !== "attribute" && target.kind !== "group") return false;
  if (!card) return false;
  if (target.kind === "attribute") return card.attributeId === target.id;
  const gids = card.groupIds?.length ? card.groupIds : [card.groupId];
  return gids.includes(target.id);
};

// Intent: Count how many cards satisfy a trigger requirement.
// Gameplay-state triggers (combo_gte, life_gte, etc.) are assumed always satisfied
// to match the reference Perfect-FC scoring model.
const triggerSatisfied = (trigger, cards) => {
  if (!trigger) return true;
  if (trigger.kind === "attribute" || trigger.kind === "group") {
    let n = 0;
    for (let i = 0; i < 5; i++) {
      if (!cards[i]) continue;
      if (trigger.kind === "attribute") {
        if (cards[i].attributeId === trigger.id) n++;
      } else {
        const gids = cards[i].groupIds?.length
          ? cards[i].groupIds
          : [cards[i].groupId];
        if (gids.includes(trigger.id)) n++;
      }
    }
    return n >= (trigger.count || 1);
  }
  // Perfect-FC model: assume gameplay-state conditions are always met
  if (
    trigger.kind === "combo_gte" ||
    trigger.kind === "life_gte" ||
    trigger.kind === "life_lte" ||
    trigger.kind === "judgement_gte"
  )
    return true;
  return false;
};

// Intent: Get effective active magnitude (conditional or base)
const getActiveMagnitude = (card, cards) => {
  const a = card.active;
  if (
    a.conditionalMagnitude !== null &&
    a.conditionalMagnitude !== undefined &&
    triggerSatisfied(a.trigger, cards)
  ) {
    return a.conditionalMagnitude;
  }
  return a.baseMagnitude;
};

// ══════════════════════════════════════════════════════════════════════════════
// HOLODORI OPTIMIZER — SCORING KERNEL
// Ported from int3rrupt3d/holodori-optimizer src/search_worker.js
// Adapted: CARDS[ids[i]] → cards[i] objects; MASKS[ids[i]][w] → cards[i].mask[w]
// ══════════════════════════════════════════════════════════════════════════════

// SUBSET_POP[s] = popcount of s (for 5-bit inclusion-exclusion subsets)
const SUBSET_POP = new Int8Array(32);
for (let s = 1; s < 32; s++) SUBSET_POP[s] = SUBSET_POP[s >> 1] + (s & 1);
// BIT_INDEX: LSB of a 1-hot 5-bit mask → position index 0-4
const BIT_INDEX = new Int8Array(32);
BIT_INDEX[1] = 0;
BIT_INDEX[2] = 1;
BIT_INDEX[4] = 2;
BIT_INDEX[8] = 3;
BIT_INDEX[16] = 4;

// Intent: Hamming-weight popcount for a 32-bit integer (ref: popcount32)
function popcount32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// Intent: Active probability helpers — clamp and apply SAR multiplier
const baseActiveProbability = (card) =>
  Math.max(0, Math.min(1, Number(card.active?.probability) || 0));
const effectiveActiveProbability = (card, sarMultiplier = 1) =>
  Math.min(1, baseActiveProbability(card) * sarMultiplier);

// Intent: Return effective active magnitude — conditional if trigger is satisfied, else base
const activeMagnitude = (card, cards) => {
  const a = card.active;
  if (
    a.conditionalMagnitude !== null &&
    a.conditionalMagnitude !== undefined &&
    triggerSatisfied(a.trigger, cards)
  )
    return a.conditionalMagnitude;
  return a.baseMagnitude;
};

// Intent: Resolve SAR pct and exposure data for one card's special skill
const specialData = (card, cards) => {
  const s = card.special || {
    magnitude: 0,
    duration: 0,
    sarPct: 0,
    sarTrigger: null,
  };
  const sarPct =
    s.sarPct > 0 && triggerSatisfied(s.sarTrigger, cards) ? s.sarPct : 0;
  return {
    magnitude: Number(s.magnitude) || 0,
    duration: Number(s.duration) || 0,
    hasSar: sarPct > 0,
    sarPct,
  };
};

// Intent: Build per-position special exposure table.
// Weights are applied by POSITION (cards[0] gets weights[0], etc.).
// The caller scores the team in its built slot order, so placement matters.
const specialForOrder = (cards, specialMode = "combo") => {
  if (specialMode === "off")
    return {
      supportExposure: 0,
      supportUplift: 0,
      values: [],
      sarWindows: [],
      sarCount: 0,
    };
  const weights =
    specialMode === "neutral" ? NEUTRAL_SPECIAL_WEIGHTS : COMBO_SPECIAL_WEIGHTS;
  let supportExposure = 0;
  const values = [],
    sarWindows = [];
  for (let i = 0; i < 5; i++) {
    const sp = specialData(cards[i], cards);
    const exposure = Math.min(sp.duration, SONG) / SONG;
    const weight = weights[i];
    const supportPct = sp.magnitude / 100;
    const weightedExposure = exposure * weight;
    supportExposure += supportPct * weightedExposure;
    const value = {
      position: i + 1,
      magnitude: sp.magnitude,
      supportPct,
      duration: sp.duration,
      weight,
      exposure,
      weightedExposure,
      bonus: 0,
      hasSar: sp.hasSar,
      sarPct: sp.sarPct,
    };
    values.push(value);
    if (sp.sarPct > 0 && sp.duration > 0)
      sarWindows.push({ ...value, multiplier: 1 + sp.sarPct });
  }
  return {
    supportExposure,
    supportUplift: 0,
    values,
    sarWindows,
    sarCount: sarWindows.length,
  };
};

// Intent: Inclusion-exclusion count of simultaneous active windows across all 5 cards
const calcCounts = (cards) => {
  const counts = new Int32Array(32);
  const inter = new Uint32Array(32);
  for (let w = 0; w < WORDS; w++) {
    inter[0] = 0xffffffff;
    for (let s = 1; s < 32; s++) {
      const bit = s & -s;
      const idx = BIT_INDEX[bit];
      inter[s] = inter[s ^ bit] & (cards[idx] ? cards[idx].mask[w] : 0);
      counts[s] += popcount32(inter[s]);
    }
  }
  return counts;
};
// Intent: Compute expected active score contribution — raw (no passive) and supported (with passive)
// Ref: timing() from search_worker.js
// Optional perCard buffers capture the exact per-card contribution for the detail panel.
const timingRef = (
  cards,
  counts,
  support,
  sarMultiplier = 1,
  perCard = null,
  perCardSupported = null,
) => {
  const p = new Float64Array(5);
  const magnitudes = new Float64Array(5);
  const priority = [0, 1, 2, 3, 4];
  for (let i = 0; i < 5; i++) {
    p[i] = effectiveActiveProbability(cards[i], sarMultiplier);
    magnitudes[i] = activeMagnitude(cards[i], cards);
  }
  priority.sort((a, b) => magnitudes[b] - magnitudes[a] || a - b);
  const rank = new Uint8Array(5);
  for (let r = 0; r < 5; r++) rank[priority[r]] = r;

  let raw = 0,
    supported = 0;
  for (let i = 0; i < 5; i++) {
    let higher = 0;
    for (let j = 0; j < 5; j++) if (rank[j] < rank[i]) higher |= 1 << j;
    let factor = 0,
      sub = higher;
    for (;;) {
      let prod = 1;
      for (let j = 0; j < 5; j++) if (sub & (1 << j)) prod *= p[j];
      factor += (SUBSET_POP[sub] & 1 ? -1 : 1) * prod * counts[(1 << i) | sub];
      if (sub === 0) break;
      sub = (sub - 1) & higher;
    }
    const contribution = (magnitudes[i] * p[i] * factor) / SONG;
    raw += contribution;
    supported += contribution * (1 + support[i]);
    if (perCard) perCard[i] = contribution;
    if (perCardSupported) perCardSupported[i] = contribution * (1 + support[i]);
  }
  return { raw, supported };
};

// Intent: Compute SAR (Success Rate Up) uplift from special-skill active windows
// Ref: sarForOrder() from search_worker.js
// Optional perCard captures each window's raw/passive/special uplift attributed to its card
// (by ordered position, position-1) for the detail panel.
const sarForOrder = (
  cards,
  counts,
  support,
  sp,
  baseTiming,
  perCard = null,
) => {
  if (!sp.sarWindows.length)
    return { rawUplift: 0, passiveUplift: 0, specialSupportUplift: 0 };
  let rawUplift = 0,
    passiveUplift = 0,
    specialSupportUplift = 0;
  for (const window of sp.sarWindows) {
    const boosted = timingRef(cards, counts, support, window.multiplier);
    const scale = window.exposure * window.weight;
    const rawDelta = (boosted.raw - baseTiming.raw) * scale;
    const passiveDelta = (boosted.supported - baseTiming.supported) * scale;
    rawUplift += rawDelta;
    passiveUplift += passiveDelta;
    specialSupportUplift += rawDelta * window.supportPct;
    if (perCard) {
      const idx = window.position - 1;
      if (!perCard[idx]) perCard[idx] = { raw: 0, passive: 0, special: 0 };
      perCard[idx].raw += rawDelta;
      perCard[idx].passive += passiveDelta;
      perCard[idx].special += rawDelta * window.supportPct;
    }
  }
  return { rawUplift, passiveUplift, specialSupportUplift };
};

// Intent: Compute outfit stat bonuses triggered by the current team composition
const outfitBonuses = (cards, outfitOwner) => {
  if (!outfitOwner?.outfit?.effects)
    return { perf: 0, tech: 0, sense: 0, all: 0, support: 0 };
  let perf = 0,
    tech = 0,
    sense = 0,
    all = 0,
    support = 0;
  for (const effect of outfitOwner.outfit.effects) {
    if (!triggerSatisfied(effect.trigger, cards)) continue;
    if (effect.kind === "perf") perf += effect.pct;
    else if (effect.kind === "tech") tech += effect.pct;
    else if (effect.kind === "sense") sense += effect.pct;
    else if (effect.kind === "all") all += effect.pct;
    else if (effect.kind === "support") support += effect.pct;
  }
  return { perf, tech, sense, all, support };
};

// Intent: Compute final index score for one outfit-leader choice.
// This formula is the critical difference from the prior engine — ref: outfitOutcome().
const outfitOutcome = (
  cards,
  outfitOwner,
  outfitIndex,
  baseStat,
  sumPerf,
  sumTech,
  sumSense,
  tm,
  sp,
  sar,
) => {
  const bon = outfitBonuses(cards, outfitOwner);
  const stat =
    baseStat +
    sumPerf * (bon.perf + bon.all) +
    sumTech * (bon.tech + bon.all) +
    sumSense * (bon.sense + bon.all);
  // Ref: supportUplift = (tm.supported - tm.raw) + bon.support * tm.raw
  const supportUplift = tm.supported - tm.raw + bon.support * tm.raw;
  // Ref: specialSupportUplift = sp.supportUplift = tm.raw * sp.supportExposure (set after timing)
  const specialSupportUplift = Number(sp.supportUplift) || 0;
  // Ref: sarUplift = sar.passiveUplift + bon.support * sar.rawUplift + sar.specialSupportUplift
  const sarUplift =
    (Number(sar.passiveUplift) || 0) +
    bon.support * (Number(sar.rawUplift) || 0) +
    (Number(sar.specialSupportUplift) || 0);
  const adjusted = tm.raw + supportUplift + specialSupportUplift + sarUplift;
  // params.other = 0 in our app (no external bonus modifier)
  const score = stat * (1 + adjusted / 100);
  return {
    score,
    stat,
    raw: tm.raw,
    uplift: supportUplift,
    sarUplift,
    specialSupportUplift,
    supported: adjusted,
    totalBonus: adjusted,
    outfitLeaderIndex: outfitIndex,
    outfitCard: cards[outfitIndex]?.id || outfitOwner?.id,
    outfitOwner: cards[outfitIndex]?.member || cards[outfitIndex]?.name,
  };
};

// Intent: Determine passive recipients with reference insertion-sort (desc total stat, asc index tiebreak)
// Ref: passiveRecipients() + RECIPIENT_BUF from search_worker.js
const RECIPIENT_BUF = new Int8Array(5);
const passiveRecipients = (cards, sourceIndex, pa) => {
  if (!pa) return 0;
  if (!triggerSatisfied(pa.trigger, cards)) return 0;
  if (pa.target?.kind === "self") {
    RECIPIENT_BUF[0] = sourceIndex;
    return 1;
  }
  let n = 0;
  for (let i = 0; i < 5; i++)
    if (cardMatchesTarget(cards[i], pa.target)) RECIPIENT_BUF[n++] = i;
  const count = pa.target?.count || n;
  if (n < count) return 0;
  // Insertion sort: descending by total stat, ascending index as tiebreak (ref exact)
  for (let i = 1; i < n; i++) {
    const v = RECIPIENT_BUF[i],
      vt = cards[v]?.total || 0;
    let j = i - 1;
    while (j >= 0) {
      const u = RECIPIENT_BUF[j],
        ut = cards[u]?.total || 0;
      if (ut > vt || (ut === vt && u < v)) break;
      RECIPIENT_BUF[j + 1] = u;
      j--;
    }
    RECIPIENT_BUF[j + 1] = v;
  }
  return count;
};

// Intent: Full scoring of one specific team ordering — the reference kernel.
// Ref: evaluateOrderGenericBase() from search_worker.js
// Optional collect object captures exact per-card contributions for the detail panel.
const evaluateOrderGenericBase = (
  cards,
  specialMode = "combo",
  collect = null,
  leader = null,
  leaderIndex = -1,
) => {
  const perf = new Float64Array(5),
    tech = new Float64Array(5),
    sense = new Float64Array(5),
    all = new Float64Array(5),
    support = new Float64Array(5);

  // Step 1: Apply passives via reference insertion-sort recipient selection
  for (let s = 0; s < 5; s++) {
    const pa = cards[s]?.passive;
    const nRecipients = passiveRecipients(cards, s, pa);
    if (!nRecipients) continue;
    for (let q = 0; q < nRecipients; q++) {
      const i = RECIPIENT_BUF[q];
      if (pa.kind === "support") support[i] += pa.pct;
      else if (pa.kind === "perf") perf[i] += pa.pct;
      else if (pa.kind === "tech") tech[i] += pa.pct;
      else if (pa.kind === "sense") sense[i] += pa.pct;
      else if (pa.kind === "all") all[i] += pa.pct;
    }
  }

  // Step 2: Compute buffed base stat (without outfit leader)
  let baseStat = 0,
    sumPerf = 0,
    sumTech = 0,
    sumSense = 0;
  for (let i = 0; i < 5; i++) {
    const c = cards[i];
    if (!c) continue;
    sumPerf += c.perf;
    sumTech += c.tech;
    sumSense += c.sense;
    baseStat +=
      c.perf * (1 + perf[i] + all[i]) +
      c.tech * (1 + tech[i] + all[i]) +
      c.sense * (1 + sense[i] + all[i]);
  }

  // Step 3: Special exposure + timing + SAR (counts computed once, reused)
  const counts = calcCounts(cards);
  const sp = specialForOrder(cards, specialMode);
  const tm = timingRef(
    cards,
    counts,
    support,
    1,
    collect?.active,
    collect?.activeSupported,
  );
  // Ref: sp.supportUplift MUST be set after timing (it depends on tm.raw)
  sp.supportUplift = tm.raw * sp.supportExposure;
  for (const v of sp.values)
    v.bonus = tm.raw * v.supportPct * v.weightedExposure;
  if (collect)
    for (const v of sp.values) collect.specialBonus[v.position - 1] = v.bonus;
  const sar = sarForOrder(cards, counts, support, sp, tm, collect?.sar);

  // Step 4: Apply the outfit leader's outfit. An explicit leader is honored;
  // otherwise fall back to the best in-team outfit (reference default 'best'
  // outfit mode) so the outfit skill is always counted.
  let best = null;
  if (leader) {
    best = outfitOutcome(
      cards,
      leader,
      leaderIndex >= 0 ? leaderIndex : -1,
      baseStat,
      sumPerf,
      sumTech,
      sumSense,
      tm,
      sp,
      sar,
    );
  } else {
    for (let o = 0; o < 5; o++) {
      const x = outfitOutcome(
        cards,
        cards[o],
        o,
        baseStat,
        sumPerf,
        sumTech,
        sumSense,
        tm,
        sp,
        sar,
      );
      if (!best || x.score > best.score) best = x;
    }
  }
  const outfitLeaderCard =
    best.outfitLeaderIndex >= 0 ? cards[best.outfitLeaderIndex] : leader;

  if (collect) {
    const bon = outfitBonuses(cards, outfitLeaderCard);
    collect.outfitBon = bon;
    collect.supportPct = support;
    for (let i = 0; i < 5; i++) {
      const s = collect.sar ? collect.sar[i] : null;
      const rawDelta = s ? s.raw : 0;
      // Active contribution includes passive support AND the leader's outfit support
      collect.activeTotal[i] =
        collect.activeSupported[i] + bon.support * collect.active[i];
      // Score bonus per card = active + special support + SAR uplift.
      // Exact decomposition: sum over cards === best.adjusted (totalBonus).
      collect.sarCard[i] =
        (s ? s.passive : 0) + (s ? s.special : 0) + bon.support * rawDelta;
      collect.cardTotalBonus[i] =
        collect.activeTotal[i] + collect.specialBonus[i] + collect.sarCard[i];
    }
    collect.teamStat = best.stat;
    collect.teamScore = best.score;
    collect.totalBonus = best.totalBonus;
    collect.outfitLeaderIndex = best.outfitLeaderIndex;
    collect.outfitLeaderName =
      best.outfitOwner ||
      outfitLeaderCard?.member ||
      outfitLeaderCard?.name ||
      null;
  }
  return best;
};

// Intent: Resolve the outfit leader card for in-app scoring.
// Reuses the in-team materialized card when the leader is one of the 5 slots,
// otherwise materializes the leader standalone (only its outfit matters).
const resolveLeaderForScoring = (leaderId, cards, characters) => {
  if (!leaderId) return { card: null, index: -1 };
  // findChar resolves character ids, asset ids, card-variant ids AND cardData
  // ids back to the owning character — the weaker direct matches below would
  // miss card-variant ids stored in a preset's team, causing the calc to fall
  // back to the best in-team outfit instead of honoring the chosen leader.
  const leaderChar = findChar(leaderId, characters);
  if (!leaderChar) return { card: null, index: -1 };
  const leaderCharId = leaderChar.id || leaderId;
  const inTeam = cards.findIndex(
    (c) => c && (c.id === leaderId || c.id === leaderCharId),
  );
  if (inTeam >= 0) return { card: cards[inTeam], index: inTeam };
  return {
    card: materializeCard(getEffectiveCardVariant(leaderChar, null), 0, 70),
    index: -1,
  };
};

// Intent: Score one team in its given slot order with a fixed outfit leader.
// Combo-special weighting is position-dependent, so the order you build matters.
const evaluateTeamOrder = (
  cards,
  specialMode = "combo",
  leader = null,
  leaderIndex = -1,
) => evaluateOrderGenericBase(cards, specialMode, null, leader, leaderIndex);

// All 120 slot orders for the 5 team members
const PERMS_5 = (() => {
  const res = [];
  const permute = (arr, m = []) => {
    if (arr.length === 0) res.push(m);
    else {
      for (let i = 0; i < arr.length; i++) {
        const curr = arr.slice();
        const next = curr.splice(i, 1);
        permute(curr.slice(), m.concat(next));
      }
    }
  };
  permute([0, 1, 2, 3, 4]);
  return res;
})();

// Intent: Find the slot order that maximizes the team's score for the given cards
// and the fixed outfit leader. Combo-special weighting is position-dependent.
const findBestTeamOrder = (cards, leaderCard, leaderIndex) => {
  let best = null,
    bestPerm = null;
  for (const perm of PERMS_5) {
    const ordered = perm.map((i) => cards[i]);
    const result = evaluateOrderGenericBase(
      ordered,
      "combo",
      null,
      leaderCard,
      leaderIndex,
    );
    if (result && (!best || result.score > best.score)) {
      best = result;
      bestPerm = perm;
    }
  }
  return bestPerm || [0, 1, 2, 3, 4];
};

// Intent: Like evaluateTeamOrder, but also returns the identity permutation and the
// exact per-card score decomposition (active / special / SAR / support) for the detail panel.
const evaluateTeamOrderDetailed = (cards, leader = null, leaderIndex = -1) => {
  const collect = {
    active: new Float64Array(5),
    activeSupported: new Float64Array(5),
    activeTotal: new Float64Array(5),
    specialBonus: new Float64Array(5),
    supportPct: null,
    sar: new Array(5).fill(null),
    sarCard: new Float64Array(5),
    cardTotalBonus: new Float64Array(5),
    outfitBon: null,
    teamStat: 0,
    teamScore: 0,
    totalBonus: 0,
    outfitLeaderIndex: -1,
    outfitLeaderName: null,
  };
  const result = evaluateOrderGenericBase(
    cards,
    "combo",
    collect,
    leader,
    leaderIndex,
  );
  if (!result) return null;
  return { result, ordered: cards, perm: [0, 1, 2, 3, 4], collect };
};


// Intent: Get active passive summaries for current team cards
const getPassiveEffectSummaries = (cards) => {
  const summaries = [];
  for (let s = 0; s < 5; s++) {
    const c = cards[s];
    const pa = c?.passive;
    if (!pa) continue;
    if (!triggerSatisfied(pa.trigger, cards)) continue;

    let recipients = [];
    if (pa.target?.kind === "self") {
      recipients = [s];
    } else {
      for (let i = 0; i < 5; i++) {
        if (cardMatchesTarget(cards[i], pa.target)) recipients.push(i);
      }
      const count = pa.target?.count || recipients.length;
      if (recipients.length < count) continue;
      recipients.sort(
        (a, b) => (cards[b]?.total || 0) - (cards[a]?.total || 0),
      );
      recipients = recipients.slice(0, count);
    }

    const recipientNames = recipients.map(
      (i) => cards[i]?.member || cards[i]?.name,
    );

    let trigStr = "";
    if (pa.trigger) {
      if (pa.trigger.kind === "group") {
        const grpName = (pa.trigger.id || "")
          .replace(/^grp-/, "")
          .replace(/_/g, " ");
        const capGrp = grpName.replace(/\b\w/g, (l) => l.toUpperCase());
        trigStr = `${pa.trigger.count || 1}+ ${capGrp}`;
      } else if (pa.trigger.kind === "attribute") {
        const attrMap = {
          CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1: "Cute Type",
          CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2: "Pure Type",
          CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3: "Happy Type",
        };
        const attrName = attrMap[pa.trigger.id] || "Type";
        trigStr = `${pa.trigger.count || 1}+ ${attrName}`;
      }
    }

    let statStr = "";
    const pctVal = Math.round(pa.pct > 1 ? pa.pct : pa.pct * 100);
    if (pa.kind === "all") statStr = `All Stats +${pctVal}%`;
    else if (pa.kind === "perf") statStr = `Performance +${pctVal}%`;
    else if (pa.kind === "tech") statStr = `Technique +${pctVal}%`;
    else if (pa.kind === "sense") statStr = `Sense +${pctVal}%`;
    else if (pa.kind === "support") statStr = `Score Support +${pctVal}%`;

    const parts = [c.member || c.name];
    if (trigStr) parts.push(trigStr);
    parts.push(statStr);

    summaries.push({
      text: `${parts.join(" · ")} → ${recipientNames.join(", ")}`,
    });
  }
  return summaries;
};

// Intent: Compute detailed breakdown for the Score Breakdown UI panel
const getTeamCalculationSummary = (
  team,
  leader,
  characters,
  bloomLevels = [0, 0, 0, 0, 0],
  cardLevels = [70, 70, 70, 70, 70],
  selectedCards = [null, null, null, null, null],
) => {
  const ids = team.filter(Boolean);
  if (ids.length < 5) return null;

  const cards = team
    .map((id, idx) => {
      if (!id) return null;
      const char = findChar(id, characters);
      if (!char) return null;
      const effectiveCard = getEffectiveCardVariant(
        char,
        selectedCards[idx] || null,
      );
      return materializeCard(
        effectiveCard,
        bloomLevels[idx] || 0,
        cardLevels[idx] || 70,
      );
    })
    .filter(Boolean);

  if (cards.length < 5) return null;
  buildEligibility(cards);

  const leaderRef = resolveLeaderForScoring(leader, cards, characters);
  const result = evaluateTeamOrder(
    cards,
    "combo",
    leaderRef.card,
    leaderRef.index,
  );
  if (!result) return null;

  const positionDetails = cards.map((c, idx) => {
    const activeMag = getActiveMagnitude(c, cards);
    const procProb = c.active?.probability
      ? (c.active.probability * 100).toFixed(1) + "%"
      : "46.0%";
    const specMag = (c.special?.magnitude || 0) + "%";
    return {
      pos: idx + 1,
      id: c.id,
      name: c.member || c.name,
      procRate: procProb,
      activeMag: activeMag + "%",
      specialMag: specMag,
      overallPower: c.perf + c.tech + c.sense,
    };
  });

  const passiveEffects = getPassiveEffectSummaries(cards);
  const outfitLeaderCard =
    result.outfitLeaderIndex >= 0
      ? cards[result.outfitLeaderIndex]
      : leaderRef.card;
  const leaderChar = findChar(outfitLeaderCard?.id, characters);

  return {
    totalTeamStat: Math.round(result.stat),
    activePct: result.raw.toFixed(2) + "%",
    supportPct: "+0.00%",
    sarPct: "+" + result.sarUplift.toFixed(2) + "%",
    specialSupportPct: "+" + result.specialSupportUplift.toFixed(2) + "%",
    totalBonusPct: result.totalBonus.toFixed(2) + "%",
    expectedIndex: Math.round(result.score),
    positionDetails,
    passiveEffects,
    outfitLeaderCard,
    leaderChar,
    outfitLeaderAuto: !leader,
    cards,
  };
};

// Intent: Per-card stat detail breakdown for the Detailed Math panel
const getTeamCalculationDetails = (
  team,
  leader,
  characters,
  bloomLevels = [0, 0, 0, 0, 0],
  cardLevels = [70, 70, 70, 70, 70],
  selectedCards = [null, null, null, null, null],
) => {
  const ids = team.filter(Boolean);
  if (ids.length < 5) return [];

  const cards = team
    .map((id, idx) => {
      if (!id) return null;
      const char = characters.find(
        (c) =>
          c.id === id ||
          c.assetId === id ||
          c.cardData?.cardId === id ||
          c.characterId === id,
      );
      if (!char) return null;
      const effectiveCard = getEffectiveCardVariant(
        char,
        selectedCards[idx] || null,
      );
      return materializeCard(
        effectiveCard,
        bloomLevels[idx] || 0,
        cardLevels[idx] || 70,
      );
    })
    .filter(Boolean);

  if (cards.length < 5) return [];
  buildEligibility(cards);

  const leaderRef = resolveLeaderForScoring(leader, cards, characters);
  // Score the team in its given slot order with the fixed outfit leader and collect
  // the per-card active / special / SAR / support decomposition.
  const detailed = evaluateTeamOrderDetailed(
    cards,
    leaderRef.card,
    leaderRef.index,
  );
  if (!detailed) return [];
  const { collect, perm } = detailed;
  // Map winning-order position -> team index (cards are shown in team order)
  const teamToPos = new Array(5);
  perm.forEach((teamIdx, p) => (teamToPos[teamIdx] = p));

  // Passive buffs per stat (team index order) + source attribution labels
  const perfB = new Float64Array(5);
  const techB = new Float64Array(5);
  const senseB = new Float64Array(5);
  const allB = new Float64Array(5);
  const supportB = new Float64Array(5);
  const sources = Array.from({ length: 5 }, () => ({
    perf: [],
    tech: [],
    sense: [],
    all: [],
    support: [],
  }));

  const cardNameAt = (i) => cards[i]?.member || cards[i]?.name || `#${i + 1}`;
  const targetLabelOf = (pa) => {
    if (!pa) return "?";
    if (pa.kind === "self") return "Self";
    if (pa.kind === "all") return "All";
    return (
      pa.target?.label ||
      pa.target?.name ||
      pa.target?.id ||
      pa.target?.kind ||
      "target"
    );
  };

  for (let s = 0; s < 5; s++) {
    const pa = cards[s]?.passive;
    if (!pa || !triggerSatisfied(pa.trigger, cards)) continue;
    let recipients = [];
    if (pa.target?.kind === "self") {
      recipients = [s];
    } else {
      for (let i = 0; i < 5; i++)
        if (cardMatchesTarget(cards[i], pa.target)) recipients.push(i);
      const count = pa.target?.count || recipients.length;
      if (recipients.length < count) continue;
      recipients.sort(
        (a, b) => (cards[b]?.total || 0) - (cards[a]?.total || 0),
      );
      recipients = recipients.slice(0, count);
    }
    const srcLabel = `${cardNameAt(s)} passive +${Math.round(
      pa.pct * 100,
    )}% ${String(pa.kind).toUpperCase()} -> ${targetLabelOf(pa)}`;
    for (const i of recipients) {
      if (pa.kind === "perf") {
        perfB[i] += pa.pct;
        sources[i].perf.push(srcLabel);
      } else if (pa.kind === "tech") {
        techB[i] += pa.pct;
        sources[i].tech.push(srcLabel);
      } else if (pa.kind === "sense") {
        senseB[i] += pa.pct;
        sources[i].sense.push(srcLabel);
      } else if (pa.kind === "all") {
        allB[i] += pa.pct;
        sources[i].all.push(srcLabel);
      } else if (pa.kind === "support") {
        supportB[i] += pa.pct;
        sources[i].support.push(srcLabel);
      }
    }
  }

  const bon = collect.outfitBon || {
    perf: 0,
    tech: 0,
    sense: 0,
    all: 0,
    support: 0,
  };
  const outfitLeaderIdx =
    collect.outfitLeaderIndex >= 0 ? collect.outfitLeaderIndex : -1;
  const outfitLeaderName =
    collect.outfitLeaderName ||
    (outfitLeaderIdx >= 0 ? cardNameAt(outfitLeaderIdx) : null);
  const outfitLabels = [];
  if (bon.perf)
    outfitLabels.push(
      `Outfit (${outfitLeaderName}) +${Math.round(bon.perf * 100)}% PERF`,
    );
  if (bon.tech)
    outfitLabels.push(
      `Outfit (${outfitLeaderName}) +${Math.round(bon.tech * 100)}% TECH`,
    );
  if (bon.sense)
    outfitLabels.push(
      `Outfit (${outfitLeaderName}) +${Math.round(bon.sense * 100)}% SENSE`,
    );
  if (bon.all)
    outfitLabels.push(
      `Outfit (${outfitLeaderName}) +${Math.round(bon.all * 100)}% ALL`,
    );
  if (bon.support)
    outfitLabels.push(
      `Outfit (${outfitLeaderName}) +${Math.round(bon.support * 100)}% Support`,
    );

  const teamChars = team.map((id) =>
    characters.find(
      (c) =>
        c.id === id ||
        c.assetId === id ||
        c.cardData?.cardId === id ||
        c.characterId === id,
    ),
  );

  const details = cards.map((c, idx) => {
    const char = teamChars[idx];
    const p = teamToPos[idx];
    const baseSense = c.sense;
    const baseTech = c.tech;
    const basePerf = c.perf;
    const senseBuff = senseB[idx] + allB[idx] + bon.sense + bon.all;
    const techBuff = techB[idx] + allB[idx] + bon.tech + bon.all;
    const perfBuff = perfB[idx] + allB[idx] + bon.perf + bon.all;
    const finalSense = baseSense * (1 + senseBuff);
    const finalTech = baseTech * (1 + techBuff);
    const finalPerf = basePerf * (1 + perfBuff);
    const overallPower = finalSense + finalTech + finalPerf;
    const a = c.active;
    const conditionMet =
      a?.conditionalMagnitude != null &&
      a.conditionalMagnitude !== undefined &&
      triggerSatisfied(a.trigger, cards);
    const effectiveActiveMag = conditionMet
      ? a.conditionalMagnitude
      : a?.baseMagnitude || 0;
    const uptimeRatio =
      a && a.duration > 0 && a.interval > 0
        ? Math.min(
            1,
            (Math.floor(SONG / a.interval) *
              a.duration *
              (a.probability || 0.46)) /
              SONG,
          )
        : 0;

    const activeContribution = collect.activeTotal[p] || 0;
    const specialContribution = collect.specialBonus[p] || 0;
    const sarContribution = collect.sarCard[p] || 0;
    const totalBonus = collect.cardTotalBonus[p] || 0;

    return {
      id: c.id,
      name: c.member,
      position: p + 1,
      accentColor: char?.accentColor || "#ffffff",
      outfitLeader: idx === outfitLeaderIdx,
      stats: {
        sense: { raw: baseSense, final: finalSense, buff: senseBuff },
        technique: { raw: baseTech, final: finalTech, buff: techBuff },
        performance: { raw: basePerf, final: finalPerf, buff: perfBuff },
      },
      statBuffSources: {
        sense: sources[idx].sense,
        technique: sources[idx].tech,
        performance: sources[idx].perf,
        all: sources[idx].all,
        support: sources[idx].support,
        outfit: outfitLabels,
      },
      overallPower,
      activeBuff: a?.baseMagnitude || 0,
      conditionalBuff: a?.conditionalMagnitude ?? null,
      conditionMet,
      effectiveActiveMag,
      uptime: {
        triggers: a ? Math.floor(SONG / a.interval) : 0,
        duration: a?.duration || 0,
        interval: a?.interval || 0,
        baseActivationRate: a?.probability || 0.46,
        triggerRate: a?.probability || 0.46,
        uptimeRatio,
      },
      specialBuff: c.special?.magnitude || 0,
      specialDuration: c.special?.duration || 0,
      sarPct: c.special?.sarPct || 0,
      activeContribution,
      specialContribution,
      sarContribution,
      totalBonus,
      unitScore: Math.round(overallPower * (1 + totalBonus / 100)),
    };
  });

  // Team-level reconciliation: sum of per-card bonuses === collect.totalBonus
  details.team = {
    stat: collect.teamStat,
    score: collect.teamScore,
    totalBonus: collect.totalBonus,
    outfitLeaderName,
  };
  return details;
};

// Map the reference engine's phase progress messages onto a single 0-100 bar.
const mapSearchProgress = (msg) => {
  const pct = msg.total > 0 ? Math.min(1, msg.done / msg.total) : 0;
  const phase = String(msg.phase);
  let scaled;
  const build = phase.match(/Building (\d)-card candidates/);
  if (build) {
    const n = Number(build[1]);
    scaled = 2 + (n - 1) * 8 + pct * 8;
  } else if (phase === "Local neighborhood polish") {
    scaled = 42;
  } else if (phase.indexOf("Polishing") >= 0) {
    scaled = 42 + pct * 16;
  } else if (phase.indexOf("Refining") >= 0) {
    scaled = 58 + pct * 32;
  } else if (phase.indexOf("Exhaustive") >= 0) {
    scaled = 90 + pct * 9;
  } else {
    scaled = 50;
  }
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const recommendBestTeamAsync = (
  ownedRoster,
  characters,
  onProgress,
  onComplete,
  options = {},
) => {
  const mode =
    options.mode === "oshi" || options.mode === "upgrade"
      ? options.mode
      : "best";
  const oshiRosterId = options.oshiCardId || null;
  const charBloomMap = {};
  const charLevelMap = {};
  const ownedIds = [];

  if (Array.isArray(ownedRoster)) {
    ownedRoster.forEach((item) => {
      if (typeof item === "string") {
        ownedIds.push(item);
        charBloomMap[item] = 0;
        charLevelMap[item] = 1;
      } else if (item && item.id) {
        ownedIds.push(item.id);
        charBloomMap[item.id] = item.bloom !== undefined ? item.bloom : 0;
        charLevelMap[item.id] = item.level !== undefined ? item.level : 1;
      }
    });
  }

  // Reference-search bridge: materialize the owned roster into the reference
  // engine's card shape so the vendored Holodori search scores it exactly.
  let materialized = [];
  let idByIndex = [];
  ownedIds.forEach((id) => {
    const char = findChar(id, characters);
    if (!char) return;
    const bloom = charBloomMap[id] !== undefined ? charBloomMap[id] : 0;
    const level =
      charLevelMap[id] && charLevelMap[id] > 1 ? charLevelMap[id] : 70;
    const card = materializeReferenceCard(char, bloom, level);
    if (card) {
      idByIndex.push(id);
      materialized.push(card);
    }
  });
  const ownedKeysList = materialized.map((c) => c.key);

  let oshiCard = null;
  if (oshiRosterId) {
    const oshiIdx = ownedIds.findIndex((id) => id === oshiRosterId);
    if (oshiIdx >= 0 && materialized[oshiIdx]) oshiCard = materialized[oshiIdx];
  }
  if (mode === "oshi" && !oshiCard) {
    onComplete({ error: "Choose your oshi card first." });
    return;
  }

  // Upgrade mode tests UNOWNED 5★ candidates, so the engine must load the full
  // card database: owned cards keep their roster level/bloom, unowned cards are
  // assumed at max Level / Bloom 0 (reference assumption). Ownership is still
  // expressed via ownedKeys.
  if (mode === "upgrade") {
    const ownedKeySet = new Set(ownedKeysList);
    const full = [];
    const fullIndex = [];
    for (const char of characters) {
      if (!char || !char.cardData) continue;
      const cd = char.cardData;
      const isOwned = ownedKeySet.has(cd.key || cd.id);
      const ownedLevel =
        charLevelMap[char.id] && charLevelMap[char.id] > 1
          ? charLevelMap[char.id]
          : 70;
      const card = materializeReferenceCard(
        char,
        isOwned ? (charBloomMap[char.id] ?? 0) : 0,
        isOwned ? ownedLevel : cd.maxLevel || 70,
      );
      if (card) {
        fullIndex.push(char.id);
        full.push(card);
      }
    }
    if (full.length < 5) {
      onComplete(null);
      return;
    }
    materialized = full;
    idByIndex = fullIndex;
  }

  if (materialized.length < 5) {
    onComplete(null);
    return;
  }

  let worker;
  let done = false;
  try {
    const source = searchWorkerSource.replace(
      "const CARDS = __CARDS__;",
      `const CARDS = ${JSON.stringify(materialized)};`,
    );
    const url = URL.createObjectURL(
      new Blob([source], { type: "application/javascript" }),
    );
    worker = new Worker(url);
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === "progress" || msg.type === "upgradeProgress") {
        if (onProgress) onProgress(mapSearchProgress(msg));
      } else if (msg.type === "upgradeDone") {
        if (done) return;
        done = true;
        if (worker) worker.terminate();
        URL.revokeObjectURL(url);
        const recommendations = [];
        for (const rec of Array.isArray(msg.recommendations)
          ? msg.recommendations
          : []) {
          const r = rec && rec.result;
          if (!r || !Array.isArray(r.ids)) continue;
          const team = r.ids.map((i) => idByIndex[i]).filter(Boolean);
          if (team.length !== 5) continue;
          const teamCards = r.ids.map((i) => materialized[i]);
          const leaderIndex = teamCards.findIndex((c) => c.id === r.outfitCard);
          const leader = idByIndex[r.ids[leaderIndex >= 0 ? leaderIndex : 0]];
          const bloomLevels = r.ids.map((i) =>
            materialized[i] ? materialized[i].bloom : 0,
          );
          const cardLevels = r.ids.map((i) =>
            materialized[i] ? materialized[i].level : 70,
          );
          const cardCharId = findChar(rec.cardId, characters)?.id || null;
          recommendations.push({
            cardId: rec.cardId,
            cardCharId,
            cardIds: teamCards.map((c) => c.id),
            rank: recommendations.length + 1,
            score: rec.score || Math.round(r.score),
            gain: Number(rec.gain) || 0,
            improves: !!rec.improves,
            team,
            leader,
            bloomLevels,
            cardLevels,
            simulatedScore: Math.round(r.score),
            summary: getTeamCalculationSummary(
              team,
              leader,
              characters,
              bloomLevels,
              cardLevels,
            ),
          });
        }
        onComplete({
          mode: "upgrade",
          baselineScore: msg.baselineScore || msg.baseline?.score || 0,
          recommendations,
          candidateCount: msg.candidateCount || 0,
          refinedCount: msg.refinedCount || 0,
        });
      } else if (msg.type === "done") {
        if (done) return;
        done = true;
        if (worker) worker.terminate();
        URL.revokeObjectURL(url);
        const topTeams = [];
        for (const r of Array.isArray(msg.results) ? msg.results : []) {
          if (!r || !Array.isArray(r.ids)) continue;
          const team = r.ids.map((i) => idByIndex[i]).filter(Boolean);
          if (team.length !== 5) continue;
          const sig = [...team].sort().join(",");
          if (topTeams.some((t) => t.sig === sig)) continue;
          const teamCards = r.ids.map((i) => materialized[i]);
          const leaderIndex = teamCards.findIndex((c) => c.id === r.outfitCard);
          const leader = idByIndex[r.ids[leaderIndex >= 0 ? leaderIndex : 0]];
          const bloomLevels = team.map((id) =>
            charBloomMap[id] !== undefined ? charBloomMap[id] : 0,
          );
          const cardLevels = team.map((id) =>
            charLevelMap[id] && charLevelMap[id] > 1 ? charLevelMap[id] : 70,
          );
          const summary = getTeamCalculationSummary(
            team,
            leader,
            characters,
            bloomLevels,
            cardLevels,
          );
          topTeams.push({
            sig,
            rank: topTeams.length + 1,
            team,
            leader,
            cardIds: r.ids.map((i) => materialized[i]?.id || null),
            bloomLevels,
            cardLevels,
            passiveCount: 0,
            simulatedScore: Math.round(r.score),
            summary,
          });
          if (topTeams.length >= 10) break;
        }
        const bestResult = topTeams[0] || {
          team: null,
          leader: null,
          passiveCount: 0,
          simulatedScore: 0,
          summary: null,
        };
        onComplete({
          topTeams,
          team: bestResult.team,
          leader: bestResult.leader,
          passiveCount: 0,
          simulatedScore: bestResult.simulatedScore,
          summary: bestResult.summary,
          mode,
          oshiMember: oshiCard ? oshiCard.member : null,
        });
      } else if (msg.type === "error") {
        if (done) return;
        done = true;
        if (worker) worker.terminate();
        URL.revokeObjectURL(url);
        console.error("Team recommendation search failed:", msg.message);
        onComplete({ error: msg.message });
      }
    };
    worker.onerror = (e) => {
      if (done) return;
      done = true;
      if (worker) worker.terminate();
      URL.revokeObjectURL(url);
      console.error("Team recommendation worker failed:", e.message);
      onComplete(null);
    };
    const baseParams = {
      scoringMode: "generic",
      specialMode: "combo",
      song: 140,
      other: 0,
      ownedOnly: true,
      ownedKeys: ownedKeysList,
      cardPool: "all",
      searchQuality: "balanced",
      topN: 10,
      boardMode: "off",
      boardFrequencyNodes: 0,
      suppressProgress: false,
    };
    const postParams =
      mode === "upgrade"
        ? {
            ...baseParams,
            action: "upgrade",
            searchMode: "owned",
            outfitMode: "best",
            upgradeOshiCardId: oshiCard ? oshiCard.id : null,
          }
        : mode === "oshi"
          ? {
              ...baseParams,
              action: "optimize",
              searchMode: "anchor",
              anchor: oshiCard.key,
              oshiCharacterId: oshiCard.characterId,
              outfitMode: "oshi",
            }
          : {
              ...baseParams,
              action: "optimize",
              searchMode: "owned",
              outfitMode: "best",
            };
    worker.postMessage(postParams);
  } catch (err) {
    console.error("Team recommendation worker failed to start:", err);
    onComplete(null);
  }
};

export default function TeamBuilder({
  presets,
  selectedPresetId,
  setSelectedPresetId,
  onUpdatePreset,
  onSavePresets,
  ownedRoster = [],
  onUpdateOwnedRoster,
  characters = [],
  allCards = [],
}) {
  const { t } = useLanguage();
  const getActiveCardList = () =>
    allCards.length > 0
      ? allCards
      : ALL_CARDS && ALL_CARDS.length > 0
        ? ALL_CARDS
        : characters.length > 0
          ? characters
          : [];
  const [isActiveExpanded, setIsActiveExpanded] = useState(false);
  const [isDetailedMathExpanded, setIsDetailedMathExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSlotIndex, setActiveSlotIndex] = useState(null); // 'leader' or 0, 1, 2, 3, 4 or null
  // Tracks the in-progress HTML5 drag source so drop handlers don't rely on
  // dataTransfer.getData (which can return empty in some browsers).
  const dragSourceRef = useRef(null);
  // True while a drag is hovering the leader block — used by the dragend
  // fallback so the leader still updates even if the browser never fires drop.
  const leaderHoverRef = useRef(false);
  // Pointer-event drag tracking (works for mouse AND touch/pen, independent of
  // the HTML5 drag-and-drop engine which touch input often doesn't trigger).
  const pointerDragRef = useRef(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [rosterSearchQuery, setRosterSearchQuery] = useState("");
  const [showRecommendationModal, setShowRecommendationModal] = useState(false);
  const [isCalculatingRec, setIsCalculatingRec] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [recommendedTeamResult, setRecommendedTeamResult] = useState(null);
  const [recommendMode, setRecommendMode] = useState("best");
  const [oshiCardId, setOshiCardId] = useState("");
  const [oshiSearchQuery, setOshiSearchQuery] = useState("");
  const currentPreset =
    presets.find((p) => p.id === selectedPresetId) || presets[0];
  const activeTeam = currentPreset.team || [null, null, null, null, null];
  const activeLeader = currentPreset.leader;

  // Helper to parse roster item configuration (default Bloom 0, default Level 70)
  function getRosterConfig(charId) {
    if (!Array.isArray(ownedRoster))
      return { isOwned: false, bloom: 0, level: 70 };
    const found = ownedRoster.find((item) => {
      if (typeof item === "string") return item === charId;
      return item && item.id === charId;
    });
    if (!found) return { isOwned: false, bloom: 0, level: 70 };
    if (typeof found === "string")
      return { isOwned: true, bloom: 0, level: 70 };
    const l = found.level !== undefined && found.level > 1 ? found.level : 70;
    return {
      isOwned: true,
      bloom: found.bloom !== undefined ? found.bloom : 0,
      level: l,
    };
  }

  // Derive active bloom and level for each slot in current team from preset or roster (defaulting to level 70 if missing)
  const activeBloomLevels = activeTeam.map((cardId, idx) => {
    if (currentPreset.bloomLevels?.[idx] !== undefined)
      return currentPreset.bloomLevels[idx];
    if (cardId) {
      const cfg = getRosterConfig(cardId);
      if (cfg.isOwned && cfg.bloom !== undefined) return cfg.bloom;
    }
    return 0;
  });

  const activeLevels = activeTeam.map((cardId, idx) => {
    if (
      currentPreset.cardLevels?.[idx] !== undefined &&
      currentPreset.cardLevels[idx] > 1
    ) {
      return currentPreset.cardLevels[idx];
    }
    if (cardId) {
      const cfg = getRosterConfig(cardId);
      if (cfg.isOwned && cfg.level && cfg.level > 1) return cfg.level;
    }
    return 70;
  });

  const activeSelectedCards = currentPreset.selectedCards || [
    null,
    null,
    null,
    null,
    null,
  ];

  const setActiveTeam = (newTeam) => {
    onUpdatePreset(selectedPresetId, { team: newTeam });
  };
  const setActiveLeader = (newLeader) => {
    onUpdatePreset(selectedPresetId, { leader: newLeader });
  };

  const handleSlotBloomChange = (slotIndex, bloomLevel) => {
    const newBloomLevels = [...activeBloomLevels];
    newBloomLevels[slotIndex] = bloomLevel;
    onUpdatePreset(selectedPresetId, { bloomLevels: newBloomLevels });
  };

  const handleSlotLevelChange = (slotIndex, levelVal) => {
    const lvl = Math.max(1, Math.min(80, parseInt(levelVal) || 70));
    const newLevels = [...activeLevels];
    newLevels[slotIndex] = lvl;
    onUpdatePreset(selectedPresetId, { cardLevels: newLevels });
  };

  const handleStartRename = () => {
    setNewNameInput(currentPreset.name);
    setIsEditingName(true);
  };
  const handleSaveRename = () => {
    if (newNameInput.trim()) {
      onUpdatePreset(selectedPresetId, { name: newNameInput.trim() });
    }
    setIsEditingName(false);
  };
  // Drag and Drop handlers for Team Units and Leader slot
  const handleDragStart = (e, sourceType, index) => {
    dragSourceRef.current = { type: sourceType, index };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "all";
      e.dataTransfer.setData("sourceType", sourceType);
      if (index !== null) {
        e.dataTransfer.setData("sourceIndex", index.toString());
      }
    }
  };
  const handleDragEnd = () => {
    const src = dragSourceRef.current;
    // Fallback for browsers/edge-cases where the drop event doesn't fire:
    // if the drag was a team unit released over the leader block, assign it.
    if (
      src &&
      src.type === "team" &&
      leaderHoverRef.current &&
      src.index !== null &&
      src.index !== undefined
    ) {
      const charId = activeTeam[src.index];
      if (charId) {
        const leaderId =
          typeof activeLeader === "string" ? activeLeader : activeLeader?.id;
        const dragId = typeof charId === "string" ? charId : charId?.id;
        if (leaderId !== dragId) {
          setActiveLeader(charId);
          setActiveSlotIndex(null);
        }
      }
    }
    leaderHoverRef.current = false;
    dragSourceRef.current = null;
  };
  const handleDragOver = (e) => {
    e.preventDefault(); // Required to allow drop!
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  };
  const handlePointerDownOnTeamSlot = (e, index) => {
    if (!activeTeam[index]) return;
    pointerDragRef.current = {
      index,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
    };
  };
  const handlePointerMoveOnContainer = (e) => {
    const p = pointerDragRef.current;
    if (p && !p.dragging) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) > 8) p.dragging = true;
    }
  };
  const handlePointerUpOnContainer = (e) => {
    const p = pointerDragRef.current;
    if (
      p &&
      p.dragging &&
      e.target &&
      e.target.closest &&
      e.target.closest(".leader-config-block")
    ) {
      const charId = activeTeam[p.index];
      if (charId) {
        const leaderId =
          typeof activeLeader === "string" ? activeLeader : activeLeader?.id;
        const dragId = typeof charId === "string" ? charId : charId?.id;
        if (leaderId !== dragId) {
          setActiveLeader(charId);
          setActiveSlotIndex(null);
        }
      }
    }
    pointerDragRef.current = null;
  };
  const handleDropOnTeamSlot = (e, targetIndex) => {
    e.preventDefault();
    const dtType = e.dataTransfer?.getData("sourceType");
    const dtIndex = e.dataTransfer?.getData("sourceIndex");
    const sourceType = dragSourceRef.current?.type || dtType;
    const sourceIndexStr =
      dragSourceRef.current?.index !== null &&
      dragSourceRef.current?.index !== undefined
        ? String(dragSourceRef.current.index)
        : dtIndex;
    if (sourceType === "team") {
      const sourceIndex = parseInt(sourceIndexStr);
      if (sourceIndex === targetIndex) return;
      // Swap the cards AND their bloom/level/selected-card config so each
      // member keeps its own configuration when the slot order changes.
      const swap = (arr) => {
        const a = [...arr];
        const t = a[targetIndex];
        a[targetIndex] = a[sourceIndex];
        a[sourceIndex] = t;
        return a;
      };
      onUpdatePreset(selectedPresetId, {
        team: swap(activeTeam),
        bloomLevels: swap(activeBloomLevels),
        cardLevels: swap(activeLevels),
        selectedCards: swap(activeSelectedCards),
      });
    } else if (sourceType === "leader") {
      if (activeLeader) {
        const newTeam = [...activeTeam];
        const newBloomLevels = [...activeBloomLevels];
        const newLevels = [...activeLevels];
        const newSelectedCards = [...activeSelectedCards];
        const existingIdx = newTeam.findIndex((id) =>
          sameChar(id, activeLeader, characters),
        );
        const temp = newTeam[targetIndex];

        if (existingIdx !== -1) {
          // Leader is already a team member → swap its slot with the target,
          // carrying each member's config along.
          newTeam[existingIdx] = temp;
          const b = newBloomLevels[targetIndex];
          newBloomLevels[targetIndex] = newBloomLevels[existingIdx];
          newBloomLevels[existingIdx] = b;
          const l = newLevels[targetIndex];
          newLevels[targetIndex] = newLevels[existingIdx];
          newLevels[existingIdx] = l;
          const s = newSelectedCards[targetIndex];
          newSelectedCards[targetIndex] = newSelectedCards[existingIdx];
          newSelectedCards[existingIdx] = s;
        } else {
          // External leader joins the team → apply its roster config at target
          const cfg = getRosterConfig(activeLeader);
          newBloomLevels[targetIndex] =
            cfg.bloom !== undefined ? cfg.bloom : 0;
          newLevels[targetIndex] = cfg.level !== undefined ? cfg.level : 70;
          newSelectedCards[targetIndex] = null;
        }
        newTeam[targetIndex] = activeLeader;
        onUpdatePreset(selectedPresetId, {
          team: newTeam,
          bloomLevels: newBloomLevels,
          cardLevels: newLevels,
          selectedCards: newSelectedCards,
        });
        setActiveLeader(temp || null); // Clear leader slot if target slot was empty
      }
    }
  };
  const handleDropOnLeaderSlot = (e) => {
    e.preventDefault();
    const dtType = e.dataTransfer?.getData("sourceType");
    const dtIndex = e.dataTransfer?.getData("sourceIndex");
    const sourceType = dragSourceRef.current?.type || dtType;
    const sourceIndexStr =
      dragSourceRef.current?.index !== null &&
      dragSourceRef.current?.index !== undefined
        ? String(dragSourceRef.current.index)
        : dtIndex;
    if (sourceType === "team") {
      const sourceIndex = parseInt(sourceIndexStr);
      const charId = activeTeam[sourceIndex];
      if (charId) {
        const leaderId = typeof activeLeader === "string" ? activeLeader : activeLeader?.id;
        const dragId = typeof charId === "string" ? charId : charId?.id;
        if (leaderId === dragId) return;

        setActiveLeader(charId);
        setActiveSlotIndex(null);
      }
    }
  };
  // Helper to extract owned card IDs (supporting string IDs or object configs)
  const handleToggleOwned = (charId) => {
    const config = getRosterConfig(charId);
    if (config.isOwned) {
      const nextRoster = ownedRoster.filter((item) =>
        typeof item === "string" ? item !== charId : item.id !== charId,
      );
      onUpdateOwnedRoster(nextRoster);
    } else {
      const nextRoster = [...ownedRoster, { id: charId, bloom: 0, level: 70 }];
      onUpdateOwnedRoster(nextRoster);
    }
  };

  const handleRosterBloomChange = (charId, bloomVal) => {
    const nextRoster = ownedRoster.map((item) => {
      const id = typeof item === "string" ? item : item.id;
      if (id === charId) {
        const curLevel =
          typeof item === "object" && item.level !== undefined && item.level > 1
            ? item.level
            : 70;
        return { id: charId, bloom: parseInt(bloomVal), level: curLevel };
      }
      return item;
    });
    onUpdateOwnedRoster(nextRoster);
  };

  const handleRosterLevelChange = (charId, levelVal) => {
    const lvl = Math.max(1, Math.min(80, parseInt(levelVal) || 70));
    const nextRoster = ownedRoster.map((item) => {
      const id = typeof item === "string" ? item : item.id;
      if (id === charId) {
        const curBloom =
          typeof item === "object" && item.bloom !== undefined ? item.bloom : 0;
        return { id: charId, bloom: curBloom, level: lvl };
      }
      return item;
    });
    onUpdateOwnedRoster(nextRoster);
  };

  const handleSelect5StarRoster = () => {
    const activeCardList = getActiveCardList();
    const fiveStars = activeCardList.filter(
      (c) =>
        c.rarity === 5 ||
        c.rarity === "5" ||
        c.rarity === "5-Star" ||
        c.id?.includes("-5-"),
    );
    const nextRoster = fiveStars.map((c) => {
      const existing = getRosterConfig(c.id);
      return {
        id: c.id,
        bloom: existing.bloom !== undefined ? existing.bloom : 0,
        level: existing.level !== undefined ? existing.level : 70,
      };
    });
    onUpdateOwnedRoster(nextRoster);
  };

  const handleSelectAllRoster = () => {
    const activeCardList = getActiveCardList();
    const nextRoster = activeCardList.map((c) => {
      const existing = getRosterConfig(c.id);
      return {
        id: c.id,
        bloom: existing.bloom !== undefined ? existing.bloom : 0,
        level: existing.level !== undefined ? existing.level : 70,
      };
    });
    onUpdateOwnedRoster(nextRoster);
  };

  const handleGenerateRecommendation = () => {
    if (recommendMode === "oshi" && !oshiCardId) {
      alert("Choose your oshi card first.");
      return;
    }
    const activeCardList = getActiveCardList();
    setIsCalculatingRec(true);
    setCalcProgress(0);
    setTimeout(() => {
      recommendBestTeamAsync(
        ownedRoster,
        activeCardList,
        (percent) => {
          setCalcProgress(percent);
        },
        (result) => {
          if (result && result.error) {
            alert(result.error);
          } else if (
            result &&
            ((result.topTeams && result.topTeams.length > 0) ||
              (result.recommendations && result.recommendations.length > 0))
          ) {
            setRecommendedTeamResult(result);
            setShowRecommendationModal(true);
          } else {
            alert(
              recommendMode === "upgrade"
                ? "You need at least 5 owned cards and at least one unowned 5★ card to search for your best next card!"
                : "Please check at least 5 characters in your owned roster to generate recommendations!",
            );
          }
          setIsCalculatingRec(false);
        },
        { mode: recommendMode, oshiCardId },
      );
    }, 60);
  };

  const handleApplyRecommendedTeam = (teamObj) => {
    if (teamObj) {
      const recTeam = teamObj.team;
      const recLeader = teamObj.leader || recTeam[0];
      const recBloomLevels =
        teamObj.bloomLevels ||
        recTeam.map((id) => getRosterConfig(id).bloom || 0);
      const recCardLevels =
        teamObj.cardLevels ||
        recTeam.map((id) => getRosterConfig(id).level || 70);
      const nextSelectedCards =
        Array.isArray(teamObj.cardIds) &&
        teamObj.cardIds.length === recTeam.length
          ? teamObj.cardIds
          : undefined;

      const nextPresets = presets.map((p) => {
        if (p.id === selectedPresetId) {
          return {
            ...p,
            team: recTeam,
            leader: recLeader,
            bloomLevels: recBloomLevels,
            cardLevels: recCardLevels,
            ...(nextSelectedCards ? { selectedCards: nextSelectedCards } : {}),
          };
        }
        return p;
      });

      onUpdatePreset(selectedPresetId, {
        team: recTeam,
        leader: recLeader,
        bloomLevels: recBloomLevels,
        cardLevels: recCardLevels,
        ...(nextSelectedCards ? { selectedCards: nextSelectedCards } : {}),
      });

      if (onSavePresets) {
        onSavePresets(nextPresets);
      }

      setShowRecommendationModal(false);
    }
  };

  const handleApplyUpgradeRecommendation = (rec) => {
    if (!rec || !rec.team || rec.team.length !== 5) return;
    const char = rec.cardCharId ? findChar(rec.cardCharId, characters) : null;
    const recCard = getEffectiveCardVariant(char, rec.cardId);
    const cardLevel =
      recCard?.cardData?.maxLevel || char?.cardData?.maxLevel || 70;
    let nextRoster = Array.isArray(ownedRoster) ? ownedRoster.slice() : [];
    if (char) {
      const sameCharacter = nextRoster.some((item) => {
        const id = typeof item === "string" ? item : item?.id;
        return (
          id === char.id || id === char.characterId || id === char.cardData?.id
        );
      });
      if (sameCharacter) {
        nextRoster = nextRoster.map((item) => {
          const id = typeof item === "string" ? item : item?.id;
          if (
            id === char.id ||
            id === char.characterId ||
            id === char.cardData?.id
          ) {
            return { id: rec.cardId, bloom: 0, level: cardLevel };
          }
          return item;
        });
      } else {
        nextRoster.push({ id: rec.cardId, bloom: 0, level: cardLevel });
      }
    }
    onUpdateOwnedRoster(nextRoster);
    const nextSelectedCards =
      Array.isArray(rec.cardIds) && rec.cardIds.length === rec.team.length
        ? rec.cardIds
        : undefined;
    const nextPresets = presets.map((p) => {
      if (p.id === selectedPresetId) {
        return {
          ...p,
          team: rec.team,
          leader: rec.leader,
          bloomLevels: rec.bloomLevels,
          cardLevels: rec.cardLevels,
          ...(nextSelectedCards ? { selectedCards: nextSelectedCards } : {}),
        };
      }
      return p;
    });
    onUpdatePreset(selectedPresetId, {
      team: rec.team,
      leader: rec.leader,
      bloomLevels: rec.bloomLevels,
      cardLevels: rec.cardLevels,
      ...(nextSelectedCards ? { selectedCards: nextSelectedCards } : {}),
    });
    if (onSavePresets) {
      onSavePresets(nextPresets);
    }
    setShowRecommendationModal(false);
  };
  const typeDisplayMap = {
    PURE: "Pure Type",
    CUTE: "Cute Type",
    HAPPY: "Happy Type",
  };
  const getTypeIcon = (type) => {
    const url = getTypeIconUrl(type);
    if (!url) return null;
    return <img src={url} alt={`${type} type`} className="tb-type-icon" />;
  };
  const getTypeColor = (type) => {
    switch (type) {
      case "PURE":
        return "#4caf50"; // Green
      case "CUTE":
        return "#ff4d6d"; // Pink
      case "HAPPY":
        return "#ff9f1c"; // Yellow/Orange
      default:
        return "var(--text-primary)";
    }
  };
  const handleSelectCharacter = (charId) => {
    const existingIdx = activeTeam.findIndex((id) =>
      sameChar(id, charId, characters),
    );
    const rosterCfg = getRosterConfig(charId);
    const defaultBloom = rosterCfg.bloom !== undefined ? rosterCfg.bloom : 0;
    const defaultLevel = rosterCfg.level !== undefined ? rosterCfg.level : 60;

    if (activeSlotIndex === "leader") {
      setActiveLeader(charId);
      setActiveSlotIndex(null);
      return;
    }
    if (activeSlotIndex !== null) {
      const newTeam = [...activeTeam];
      const newBloomLevels = [...activeBloomLevels];
      const newLevels = [...activeLevels];
      const newSelectedCards = [...activeSelectedCards];
      if (existingIdx !== -1) {
        // Moving a member between slots → carry its own config along
        const existingId = newTeam[existingIdx];
        newTeam[existingIdx] = null;
        newBloomLevels[activeSlotIndex] = activeBloomLevels[existingIdx];
        newLevels[activeSlotIndex] = activeLevels[existingIdx];
        newSelectedCards[activeSlotIndex] = activeSelectedCards[existingIdx];
        newBloomLevels[existingIdx] = 0;
        newLevels[existingIdx] = 70;
        newSelectedCards[existingIdx] = null;
        newTeam[activeSlotIndex] = existingId;
      } else {
        // New placement → apply roster defaults
        newBloomLevels[activeSlotIndex] = defaultBloom;
        newLevels[activeSlotIndex] = defaultLevel;
        newTeam[activeSlotIndex] = charId;
      }

      onUpdatePreset(selectedPresetId, {
        team: newTeam,
        bloomLevels: newBloomLevels,
        cardLevels: newLevels,
        selectedCards: newSelectedCards,
      });
      setActiveSlotIndex(null);
    } else {
      const isAlreadyInTeam = activeTeam.some((id) =>
        sameChar(id, charId, characters),
      );
      if (isAlreadyInTeam) {
        const newTeam = activeTeam.map((id) =>
          sameChar(id, charId, characters) ? null : id,
        );
        setActiveTeam(newTeam);
      } else {
        const emptyIdx = activeTeam.findIndex((id) => !id);
        if (emptyIdx !== -1) {
          const newTeam = [...activeTeam];
          newTeam[emptyIdx] = charId;

          const newBloomLevels = [...activeBloomLevels];
          newBloomLevels[emptyIdx] = defaultBloom;

          const newLevels = [...activeLevels];
          newLevels[emptyIdx] = defaultLevel;

          onUpdatePreset(selectedPresetId, {
            team: newTeam,
            bloomLevels: newBloomLevels,
            cardLevels: newLevels,
          });
        }
      }
    }
  };
  const handleClearSlot = (index, e) => {
    e.stopPropagation(); // Prevent activating the slot focus
    const newTeam = [...activeTeam];
    newTeam[index] = null;
    setActiveTeam(newTeam);
  };
  const handleClearLeader = (e) => {
    e.stopPropagation(); // Prevent activating slot focus
    setActiveLeader(null);
  };
  // Reorder the 5 team slots to the highest-scoring arrangement for the current
  // leader. Carries bloom/level/selected-card config with each member.
  const handleBestPosition = () => {
    const ids = activeTeam.filter(Boolean);
    if (ids.length < 5) return;
    const cards = activeTeam.map((id, idx) => {
      if (!id) return null;
      const char = findChar(id, characters);
      if (!char) return null;
      const effectiveCard = getEffectiveCardVariant(
        char,
        activeSelectedCards[idx] || null,
      );
      return materializeCard(
        effectiveCard,
        activeBloomLevels[idx] || 0,
        activeLevels[idx] || 70,
      );
    });
    if (cards.some((c) => !c)) return;
    buildEligibility(cards);
    const leaderRef = resolveLeaderForScoring(activeLeader, cards, characters);
    const perm = findBestTeamOrder(cards, leaderRef.card, leaderRef.index);
    const reorder = (arr) => perm.map((i) => arr[i]);
    onUpdatePreset(selectedPresetId, {
      team: reorder(activeTeam),
      bloomLevels: reorder(activeBloomLevels),
      cardLevels: reorder(activeLevels),
      selectedCards: reorder(activeSelectedCards),
    });
  };
  // Find active synergies by checking verbatim character passive skills
  // Evaluate both active and inactive synergies
  const getSynergiesState = () => {
    const active = [];
    const inactive = [];
    // Only the 5 team units count toward "N or more X Members" triggers —
    // a leader kept as a separate unit is NOT a team member (matches the
    // scoring kernel's triggerSatisfied which iterates the 5 team cards).
    const teamIds = activeTeam.filter(Boolean);
    // 1. Evaluate Leader Passive (Outfit Skill)
    if (activeLeader) {
      const leaderChar = findChar(activeLeader, characters);
      if (leaderChar && leaderChar.skills && leaderChar.skills.outfit) {
        const outfitText = leaderChar.skills.outfit;
        let isActivated = false;

        const match = outfitText.match(
          /(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i,
        );

        if (!match) {
          isActivated = true;
        } else {
          const requiredCount = parseInt(match[1] || match[2]) || 2;
          const rawTarget = match[3].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[[\]]/g, "")
            .replace(/\bTYPE\b/g, "")
            .trim();

          let count = 0;
          teamIds.forEach((activeId) => {
            const activeChar = findChar(activeId, characters);
            if (activeChar) {
              if (
                getCharGroupLabels(activeChar).has(condTarget) ||
                activeChar.type.toUpperCase() === condTarget
              ) {
                count++;
              }
            }
          });

          if (count >= requiredCount) {
            isActivated = true;
          }
        }

        const item = {
          charId: leaderChar.id,
          charName: leaderChar.name,
          accentColor: "#ffb703",
          desc: outfitText,
          isLeader: true,
        };

        if (isActivated) {
          active.push(item);
        } else {
          inactive.push(item);
        }
      }
    }
    // 2. Evaluate normal passives — only for actual team units. A leader kept
    // as a separate unit has no passive contribution in the scoring kernel.
    teamIds.forEach((id) => {
      const char = findChar(id, characters);
      if (char && char.skills && char.skills.passive) {
        const passiveText = char.skills.passive;
        let isActivated = false;

        const match = passiveText.match(
          /(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i,
        );

        if (!match) {
          isActivated = true;
        } else {
          const requiredCount = parseInt(match[1] || match[2]) || 2;
          const rawTarget = match[3].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[[\]]/g, "")
            .replace(/\bTYPE\b/g, "")
            .trim();

          let count = 0;
          teamIds.forEach((activeId) => {
            const activeChar = findChar(activeId, characters);
            if (activeChar) {
              if (
                getCharGroupLabels(activeChar).has(condTarget) ||
                activeChar.type.toUpperCase() === condTarget
              ) {
                count++;
              }
            }
          });

          if (count >= requiredCount) {
            isActivated = true;
          }
        }

        const item = {
          charId: char.id,
          charName: char.name,
          accentColor: char.accentColor,
          desc: passiveText,
          isLeader: false,
        };

        if (isActivated) {
          active.push(item);
        } else {
          inactive.push(item);
        }
      }
    });
    // Sort active so leader skill is ALWAYS first
    active.sort((a, b) => {
      if (a.isLeader && !b.isLeader) return -1;
      if (!a.isLeader && b.isLeader) return 1;
      return 0;
    });
    return { active, inactive };
  };
  const { active: activeSynergies } = getSynergiesState();
  const filteredRoster = characters.filter((char) =>
    char.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeCardList = getActiveCardList();

  const matchingSearchCards = rosterSearchQuery.trim()
    ? activeCardList.filter(
        (c) =>
          c.name.toLowerCase().includes(rosterSearchQuery.toLowerCase()) ||
          (c.title &&
            c.title.toLowerCase().includes(rosterSearchQuery.toLowerCase())) ||
          c.group.toLowerCase().includes(rosterSearchQuery.toLowerCase()) ||
          Array.from(getCharGroupLabels(c)).some((l) =>
            l.toLowerCase().includes(rosterSearchQuery.toLowerCase()),
          ),
      )
    : [];

  const ownedRosterCards = (Array.isArray(ownedRoster) ? ownedRoster : [])
    .map((item) => {
      const charId = typeof item === "string" ? item : item?.id;
      return activeCardList.find((c) => c.id === charId);
    })
    .filter(Boolean);

  const selectedOshiChar = oshiCardId
    ? ownedRosterCards.find((c) => c.id === oshiCardId) || null
    : null;

  const matchingOshiCards = oshiSearchQuery.trim()
    ? ownedRosterCards.filter(
        (c) =>
          c.name.toLowerCase().includes(oshiSearchQuery.toLowerCase()) ||
          (c.title &&
            c.title.toLowerCase().includes(oshiSearchQuery.toLowerCase())) ||
          String(c.rarityNum ?? c.cardData?.rarity ?? "").includes(
            oshiSearchQuery.replace(/★/g, "").toLowerCase(),
          ),
      )
    : [];

  const leaderChar = findChar(activeLeader, characters);
  const isLeaderInTeam = activeTeam.some((id) => {
    if (!id || !activeLeader) return false;
    if (id === activeLeader) return true;
    const cardObj = findChar(id, characters);
    return (
      cardObj &&
      leaderChar &&
      (cardObj.id === leaderChar.id ||
        cardObj.characterId === leaderChar.characterId ||
        cardObj.assetId === leaderChar.assetId ||
        cardObj.name === leaderChar.name ||
        cardObj.cardData?.id === leaderChar.cardData?.id)
    );
  });
  const activeCharsCount = activeTeam.filter(Boolean).reduce((acc, charId) => {
    const char = findChar(charId, characters);
    if (!char) return acc;
    const isPassiveActive = activeSynergies.some(
      (s) =>
        s.charId === char.id ||
        s.charId === char.cardData?.id ||
        s.charId === char.assetId,
    );
    return isPassiveActive ? acc + 1 : acc;
  }, 0);
  return (
    <div className="team-builder-page animate-fade-in">
      <div className="builder-header">
        <h1 className="page-title">{t("builder_title")}</h1>
        <p className="page-subtitle">{t("builder_desc")}</p>
      </div>
      {/* Presets Manager */}
      <div className="presets-manager glass">
        <div className="presets-header">
          <h3 className="section-title-small">{t("presets_manager")}</h3>
          <span className="presets-info-text">{t("presets_desc")}</span>
        </div>

        <div className="presets-list-bar">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={`preset-selector-btn ${selectedPresetId === preset.id ? "selected" : ""} ${preset.isActive ? "active-deck" : ""}`}
              onClick={() => {
                setSelectedPresetId(preset.id);
                setIsEditingName(false);
              }}
            >
              {preset.isActive && (
                <Award size={12} className="text-gold mr-1" />
              )}
              <span className="preset-btn-name">{preset.name}</span>
            </button>
          ))}
        </div>
        <div className="preset-actions-bar">
          <div className="preset-meta-info">
            {isEditingName ? (
              <div className="rename-input-wrapper">
                <input
                  type="text"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  className="rename-input glass"
                  maxLength={25}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                />
                <button className="btn-rename-save" onClick={handleSaveRename}>
                  Save
                </button>
                <button
                  className="btn-rename-cancel"
                  onClick={() => setIsEditingName(false)}
                >
                  {t("cancel")}
                </button>
              </div>
            ) : (
              <div className="preset-name-display">
                <span className="current-preset-label">
                  {t("editing_label")}
                </span>
                <strong className="current-preset-value">
                  {currentPreset.name}
                </strong>
                <button
                  className="btn-icon-rename"
                  onClick={handleStartRename}
                  title="Rename preset"
                >
                  {t("rename_preset")}
                </button>
              </div>
            )}
          </div>
          <div className="preset-control-buttons">
            {!currentPreset.isActive && (
              <button
                className="btn-activate-preset"
                onClick={() =>
                  onUpdatePreset(selectedPresetId, { isActive: true })
                }
              >
                {t("make_active")}
              </button>
            )}
            {currentPreset.isActive && (
              <span className="active-party-badge">
                <CheckCircle2 size={12} className="text-green" />{" "}
                {t("primary_active_party")}
              </span>
            )}
            <button
              className="btn-clear-preset"
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to clear "${currentPreset.name}" slots?`,
                  )
                ) {
                  onUpdatePreset(selectedPresetId, {
                    team: [null, null, null, null, null],
                    leader: null,
                  });
                }
              }}
            >
              {t("clear_slots")}
            </button>
          </div>
        </div>
      </div>
      {/* Owned Roster Manager */}
      <div className="roster-manager glass">
        <div
          className="roster-header"
          onClick={() => setIsRosterExpanded(!isRosterExpanded)}
        >
          <div className="roster-header-title-block">
            <h3 className="section-title-small">{t("my_character_roster")}</h3>
            <span className="presets-info-text">
              {t("roster_desc", { owned: ownedRoster.length })}
            </span>
          </div>
          <button className="btn-toggle-roster">
            {isRosterExpanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </button>
        </div>
        {isRosterExpanded && (
          <div className="roster-body animate-slide-down">
            {/* Search & Add Bar */}
            <div className="roster-search-section">
              <div className="roster-search-input-wrapper glass">
                <Search size={16} className="text-secondary mr-2" />
                <input
                  type="text"
                  placeholder="Search card name or card title to add to roster..."
                  value={rosterSearchQuery}
                  onChange={(e) => setRosterSearchQuery(e.target.value)}
                  className="roster-search-input"
                />
                {rosterSearchQuery && (
                  <button
                    className="btn-clear-search"
                    onClick={() => setRosterSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Live Search Results Dropdown */}
              {rosterSearchQuery.trim().length > 0 && (
                <div className="roster-search-results-dropdown glass animate-fade-in">
                  <div className="search-results-header">
                    <span>
                      Search Results ({matchingSearchCards.length} cards match)
                    </span>
                  </div>
                  {matchingSearchCards.length === 0 ? (
                    <p className="no-search-results">
                      No matching characters or card titles found.
                    </p>
                  ) : (
                    <div className="search-results-grid">
                      {matchingSearchCards.map((char) => {
                        const cfg = getRosterConfig(char.id);
                        const isOwned = cfg.isOwned;
                        return (
                          <div
                            key={char.id}
                            className="search-card-result-item glass"
                          >
                            <div className="search-card-thumb">
                              {char.image ? (
                                <img
                                  src={char.image}
                                  alt={char.name}
                                  className="search-thumb-img"
                                />
                              ) : (
                                <span className="avatar-fallback">
                                  {char.avatar}
                                </span>
                              )}
                            </div>
                            <div className="search-card-info">
                              <span className="search-card-name">
                                {char.name}
                              </span>
                              <span className="search-card-title">
                                {char.title}
                              </span>
                              <div className="search-card-badges">
                                <span className="badge-role-mini">
                                  {char.group}
                                </span>
                                <span
                                  className="badge-type-mini"
                                  style={{ color: getTypeColor(char.type) }}
                                >
                                  {char.type}
                                </span>
                              </div>
                            </div>
                            <button
                              className={`btn-add-roster ${isOwned ? "added" : ""}`}
                              onClick={() => handleToggleOwned(char.id)}
                            >
                              {isOwned ? "In Roster" : "+ Add Card"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Roster Controls & Quick Actions */}
            <div className="roster-controls">
              <div className="recommend-goal-bar">
                <div className="recommend-goal-toggle" role="group">
                  {[
                    {
                      key: "best",
                      label: "Best team",
                      title: "Strongest combination from my roster",
                    },
                    {
                      key: "oshi",
                      label: "Around my oshi",
                      title: "Lock one owned card into every team",
                    },
                    {
                      key: "upgrade",
                      label: "Next card",
                      title: "Which unowned card would improve my roster most",
                    },
                  ].map((goal) => (
                    <button
                      key={goal.key}
                      type="button"
                      className={`recommend-goal-card${recommendMode === goal.key ? " active" : ""}`}
                      title={goal.title}
                      onClick={() => {
                        setRecommendMode(goal.key);
                        if (goal.key === "best") {
                          setOshiCardId("");
                          setOshiSearchQuery("");
                        }
                      }}
                    >
                      {goal.label}
                    </button>
                  ))}
                </div>
                {recommendMode !== "best" && (
                  <div className="recommend-oshi-picker">
                    <span className="recommend-oshi-label">Oshi card</span>
                    {selectedOshiChar ? (
                      <div className="recommend-oshi-selected">
                        <span className="badge-role-mini">
                          {selectedOshiChar.rarityNum ??
                            selectedOshiChar.cardData?.rarity}
                          ★
                        </span>
                        <strong>{selectedOshiChar.name}</strong>
                        <span className="recommend-oshi-selected-title">
                          {selectedOshiChar.title}
                        </span>
                        <button
                          className="btn-clear-search"
                          title="Clear oshi card"
                          onClick={() => setOshiCardId("")}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="recommend-oshi-search-wrap">
                        <div className="roster-search-input-wrapper glass recommend-oshi-search">
                          <Search size={15} className="text-secondary mr-2" />
                          <input
                            type="text"
                            className="roster-search-input"
                            value={oshiSearchQuery}
                            onChange={(e) => setOshiSearchQuery(e.target.value)}
                            placeholder="Search oshi card name or card title to keep in team"
                          />
                          {oshiSearchQuery && (
                            <button
                              className="btn-clear-search"
                              title="Clear search"
                              onClick={() => setOshiSearchQuery("")}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        {oshiSearchQuery.trim().length > 0 && (
                          <div className="roster-search-results-dropdown glass animate-fade-in recommend-oshi-dropdown">
                            <div className="search-results-header">
                              <span>
                                Owned cards ({matchingOshiCards.length} match)
                              </span>
                            </div>
                            {matchingOshiCards.length === 0 ? (
                              <p className="no-search-results">
                                No owned cards match "{oshiSearchQuery.trim()}".
                              </p>
                            ) : (
                              <div className="search-results-grid recommend-oshi-results-grid">
                                {matchingOshiCards.map((c) => {
                                  const isSelected = oshiCardId === c.id;
                                  const rarityNum =
                                    c.rarityNum ?? c.cardData?.rarity;
                                  return (
                                    <div
                                      key={c.id}
                                      className={`search-card-result-item recommend-oshi-result${
                                        isSelected ? " is-selected" : ""
                                      }`}
                                      onClick={() => {
                                        setOshiCardId(c.id);
                                        setOshiSearchQuery("");
                                      }}
                                    >
                                      <div className="search-card-thumb">
                                        {c.image ? (
                                          <img
                                            src={c.image}
                                            alt={c.name}
                                            className="search-thumb-img"
                                          />
                                        ) : (
                                          <span className="avatar-fallback">
                                            {c.avatar}
                                          </span>
                                        )}
                                      </div>
                                      <div className="search-card-info">
                                        <span className="search-card-name">
                                          {c.name}
                                        </span>
                                        <span className="search-card-title">
                                          {c.title}
                                        </span>
                                        <div className="search-card-badges">
                                          <span className="badge-role-mini">
                                            {rarityNum}★
                                          </span>
                                          <span
                                            className="badge-type-mini"
                                            style={{
                                              color: getTypeColor(c.type),
                                            }}
                                          >
                                            {c.type}
                                          </span>
                                        </div>
                                      </div>
                                      <span
                                        className={`recommend-oshi-check${
                                          isSelected ? " on" : ""
                                        }`}
                                      >
                                        {isSelected ? "Selected" : "Select"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="btn-icon-rename"
                onClick={handleSelect5StarRoster}
              >
                Add All 5★ Cards
              </button>
              <button
                className="btn-icon-rename"
                onClick={handleSelectAllRoster}
              >
                Add All Cards
              </button>
              <button
                className="btn-icon-rename"
                onClick={() => onUpdateOwnedRoster([])}
              >
                Clear Roster
              </button>
              <button
                className="btn-activate-preset"
                onClick={handleGenerateRecommendation}
                disabled={ownedRoster.length < 5}
                style={{
                  opacity: ownedRoster.length < 5 ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <Sparkles size={12} />{" "}
                {recommendMode === "upgrade"
                  ? "Find my best next card"
                  : recommendMode === "oshi"
                    ? "Best team around my oshi"
                    : t("smart_suggest")}
              </button>
            </div>

            {/* Saved Roster Cards List */}
            <div className="owned-cards-section">
              <h4 className="owned-grid-heading">
                My Saved Roster ({ownedRosterCards.length} Cards)
              </h4>

              {ownedRosterCards.length === 0 ? (
                <div className="empty-roster-placeholder glass">
                  <p>
                    Your roster is empty. Use the search bar above or click "Add
                    All 5★ Cards" to quickly build your roster.
                  </p>
                </div>
              ) : (
                <div className="owned-cards-grid">
                  {ownedRosterCards.map((char) => {
                    const cfg = getRosterConfig(char.id);
                    return (
                      <div
                        key={char.id}
                        className="owned-roster-card glass"
                        style={{ borderLeft: `3px solid ${char.accentColor}` }}
                      >
                        <button
                          className="btn-remove-roster-card"
                          onClick={() => handleToggleOwned(char.id)}
                          title="Remove from Roster"
                        >
                          <Trash2 size={13} />
                        </button>

                        <div className="owned-card-media">
                          {char.image ? (
                            <img
                              src={char.image}
                              alt={char.name}
                              className="owned-card-img"
                            />
                          ) : (
                            <span className="avatar-fallback">
                              {char.avatar}
                            </span>
                          )}
                        </div>

                        <div className="owned-card-details">
                          <span className="owned-card-name">{char.name}</span>
                          <span className="owned-card-title">{char.title}</span>
                          <div className="owned-card-badges">
                            <span className="badge-role-mini">
                              {char.group}
                            </span>
                            <span
                              className="badge-type-mini"
                              style={{ color: getTypeColor(char.type) }}
                            >
                              {char.type}
                            </span>
                          </div>

                          {/* Level and Bloom Progression Selectors */}
                          <div className="owned-card-progression">
                            <div className="progression-field progression-field-lv">
                              <label>Lv</label>
                              <input
                                type="number"
                                min={1}
                                max={80}
                                value={cfg.level}
                                onChange={(e) =>
                                  handleRosterLevelChange(
                                    char.id,
                                    e.target.value,
                                  )
                                }
                                className="roster-level-input"
                              />
                            </div>

                            <div className="progression-field">
                              <label>Bloom</label>
                              <select
                                value={cfg.bloom}
                                onChange={(e) =>
                                  handleRosterBloomChange(
                                    char.id,
                                    e.target.value,
                                  )
                                }
                                className="roster-bloom-select"
                              >
                                <option value={0}>Bloom 0</option>
                                <option value={1}>Bloom 1</option>
                                <option value={2}>Bloom 2 (+10%)</option>
                                <option value={3}>Bloom 3</option>
                                <option value={4}>Bloom 4</option>
                                <option value={5}>Bloom 5</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Loading Spinner Modal */}
      {isCalculatingRec && (
        <div
          className="modal-overlay"
          style={{
            backdropFilter: "blur(10px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="modal-content glass animate-fade-in"
            style={{
              maxWidth: "420px",
              textAlign: "center",
              padding: "2.5rem 1.5rem",
              borderRadius: "16px",
              background: "#0e172a",
              border: "1px solid #233458",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            <h3
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: "0 0 0.5rem",
              }}
            >
              Optimizing Roster Teams...
            </h3>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                margin: "0 0 1rem",
              }}
            >
              Evaluating permutations and active skill overlaps across your
              roster cards.
            </p>
            <div
              style={{
                width: "100%",
                background: "#1e293b",
                height: "8px",
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(5, calcProgress)}%`,
                  background: "linear-gradient(90deg, #3a86ff, #ffd700)",
                  height: "100%",
                  transition: "width 0.1s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#ffd700",
                display: "block",
                marginTop: "0.5rem",
              }}
            >
              {calcProgress}% Completed
            </span>
          </div>
        </div>
      )}

      {/* Top 10 Recommendation Modal */}
      {showRecommendationModal && recommendedTeamResult && (
        <div
          className="modal-overlay"
          onClick={() => setShowRecommendationModal(false)}
        >
          <div
            className="modal-content glass animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "920px", maxHeight: "88vh", overflowY: "auto" }}
          >
            <div
              className="modal-header"
              style={{
                paddingTop: "0.5rem",
                paddingBottom: "0.75rem",
                border: "none",
                background: "transparent",
              }}
            >
              <div
                className="modal-header-title"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Sparkles size={20} className="text-gold animate-pulse" />
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
                  {recommendedTeamResult.mode === "upgrade"
                    ? "Best Next Cards"
                    : recommendedTeamResult.mode === "oshi"
                      ? `Best Team Around ${recommendedTeamResult.oshiMember || "Your Oshi"}`
                      : "Top 10 Recommended Teams"}
                </h2>
              </div>
              <button
                className="btn-close-modal"
                onClick={() => setShowRecommendationModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ marginTop: "1rem" }}>
              {recommendedTeamResult.mode === "upgrade" ? (
                <p
                  className="recommendation-desc"
                  style={{ marginBottom: "1.25rem" }}
                >
                  Every unowned 5★ card was tested against your roster using the
                  Holodori Optimizer scoring engine. Only cards that keep a
                  valid 5-card team are shown. New cards are assumed at max
                  Level and Bloom 0 — the resulting team still follows your
                  roster.
                </p>
              ) : (
                <p
                  className="recommendation-desc"
                  style={{ marginBottom: "1.25rem" }}
                >
                  We evaluated all team combinations from your roster using
                  Holodori Optimizer scoring engine. These results are already
                  ordered for their best modeled positions. Here are the{" "}
                  <strong>
                    {recommendedTeamResult.mode === "oshi"
                      ? "Top 10 highest-scoring teams built around your oshi"
                      : "Top 10 highest-scoring team configurations"}
                  </strong>
                  :
                </p>
              )}

              <div
                className="top-10-teams-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {recommendedTeamResult.mode === "upgrade" ? (
                  <div className="upgrade-recs-list">
                    {recommendedTeamResult.recommendations.map(
                      (rec, recIdx) => {
                        const char = rec.cardCharId
                          ? findChar(rec.cardCharId, characters)
                          : null;
                        const recCard = getEffectiveCardVariant(
                          char,
                          rec.cardId,
                        );
                        const isTop = recIdx === 0;
                        const improves = rec.improves && rec.gain > 1e-8;
                        const gainPct = (rec.gain * 100).toFixed(1);
                        const displayImg = recCard?.assetId
                          ? cardArtUrl(recCard.assetId)
                          : char?.image ||
                            char?.fallbackImage ||
                            char?.cardData?.image;
                        const recName =
                          char?.member ||
                          char?.cardData?.member ||
                          char?.name ||
                          "Unknown card";
                        const cardTitle =
                          recCard?.title || recCard?.cardData?.name || "";
                        return (
                          <div
                            key={recIdx}
                            className="top-team-card glass"
                            style={{
                              padding: "1rem 1.25rem",
                              borderRadius: "14px",
                              border: isTop
                                ? "1px solid #ffd700"
                                : "1px solid #233458",
                              background: isTop
                                ? "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(15,23,42,0.9))"
                                : "rgba(15,23,42,0.7)",
                              boxShadow: isTop
                                ? "0 8px 30px rgba(255,215,0,0.15)"
                                : "none",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.85rem",
                                flexWrap: "wrap",
                                gap: "0.75rem",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.85rem",
                                }}
                              >
                                <span
                                  style={{
                                    padding: "4px 12px",
                                    borderRadius: "999px",
                                    fontSize: "0.85rem",
                                    fontWeight: 800,
                                    background: isTop
                                      ? "linear-gradient(135deg, #ffd700, #ff9f1c)"
                                      : "#233458",
                                    color: isTop ? "#071226" : "#f3f6ff",
                                    boxShadow: isTop
                                      ? "0 0 12px rgba(255,215,0,0.4)"
                                      : "none",
                                  }}
                                >
                                  {isTop ? "#1 BEST VALUE" : `#${rec.rank}`}
                                </span>
                                <div
                                  style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "50%",
                                    border: `2px solid ${char?.accentColor || "#3b82f6"}`,
                                    overflow: "hidden",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "#1e293b",
                                    flexShrink: 0,
                                  }}
                                >
                                  {displayImg ? (
                                    <img
                                      src={displayImg}
                                      alt={recName}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        objectPosition: "50% 25%",
                                      }}
                                    />
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: "1rem",
                                        fontWeight: 800,
                                        color: char?.accentColor || "#3b82f6",
                                      }}
                                    >
                                      {char?.avatar || recName.substring(0, 2)}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <div
                                    style={{
                                      fontSize: "1.05rem",
                                      fontWeight: 800,
                                      color: isTop
                                        ? "#ffd700"
                                        : "var(--text-primary)",
                                    }}
                                  >
                                    {recName}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {cardTitle || char?.name || ""}
                                  </div>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div
                                  style={{
                                    fontSize: "1.2rem",
                                    fontWeight: 800,
                                    color: improves ? "#3ddc97" : "#f87171",
                                  }}
                                >
                                  {improves ? `+${gainPct}%` : "No improvement"}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  vs current best{" "}
                                  {Number(
                                    recommendedTeamResult.baselineScore || 0,
                                  ).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(5, 1fr)",
                                gap: "0.5rem",
                              }}
                            >
                              {rec.team.map((charId, cIdx) => {
                                const tc = findChar(charId, characters);
                                const memberCard = getEffectiveCardVariant(
                                  tc,
                                  rec.cardIds?.[cIdx],
                                );
                                const isNew =
                                  rec.cardIds?.[cIdx] === rec.cardId;
                                const name =
                                  tc?.member ||
                                  tc?.cardData?.member ||
                                  tc?.name ||
                                  `Unit ${cIdx + 1}`;
                                const img = memberCard?.assetId
                                  ? cardArtUrl(memberCard.assetId)
                                  : tc?.image ||
                                    tc?.fallbackImage ||
                                    tc?.cardData?.image;
                                return (
                                  <div
                                    key={cIdx}
                                    style={{
                                      background: "#0e172a",
                                      border: isNew
                                        ? "1px solid #ffd700"
                                        : "1px solid #233458",
                                      borderRadius: "10px",
                                      padding: "0.5rem 0.25rem",
                                      textAlign: "center",
                                      position: "relative",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        margin: "0 auto 4px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: "#1e293b",
                                        border: isNew
                                          ? "2px solid #ffd700"
                                          : "2px solid transparent",
                                      }}
                                    >
                                      {img ? (
                                        <img
                                          src={img}
                                          alt={name}
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            objectPosition: "50% 25%",
                                          }}
                                        />
                                      ) : (
                                        <span
                                          style={{
                                            fontSize: "0.9rem",
                                            fontWeight: 800,
                                            color: tc?.accentColor || "#3b82f6",
                                          }}
                                        >
                                          {name.substring(0, 2)}
                                        </span>
                                      )}
                                    </div>
                                    <strong
                                      style={{
                                        fontSize: "0.68rem",
                                        color: "var(--text-primary)",
                                        display: "block",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {name}
                                    </strong>
                                    {isNew && (
                                      <span
                                        style={{
                                          fontSize: "0.6rem",
                                          color: "#ffd700",
                                          fontWeight: 900,
                                        }}
                                      >
                                        NEW
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div
                              style={{
                                marginTop: "0.85rem",
                                display: "flex",
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                className="btn-primary"
                                onClick={() =>
                                  handleApplyUpgradeRecommendation(rec)
                                }
                                style={{
                                  padding: "8px 18px",
                                  fontSize: "0.85rem",
                                  fontWeight: 700,
                                  background: isTop
                                    ? "linear-gradient(135deg, #3a86ff, #4361ee)"
                                    : "#233458",
                                  border: isTop ? "none" : "1px solid #425174",
                                }}
                              >
                                Add card to roster & apply team
                              </button>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                ) : (
                  (
                    recommendedTeamResult.topTeams || [recommendedTeamResult]
                  ).map((teamItem, teamIdx) => {
                    const rankNum = teamItem.rank || teamIdx + 1;
                    const isTop1 = rankNum === 1;
                    const ldrChar = findChar(teamItem.leader, characters);
                    const ldrIdx = teamItem.team.findIndex((id) => {
                      const c = findChar(id, characters);
                      return (
                        c &&
                        (id === teamItem.leader ||
                          c.id === teamItem.leader ||
                          c.cardData?.id === teamItem.leader ||
                          c.characterId === teamItem.leader)
                      );
                    });
                    const ldrCard = getEffectiveCardVariant(
                      ldrChar,
                      ldrIdx >= 0 ? teamItem.cardIds?.[ldrIdx] : undefined,
                    );
                    return (
                      <div
                        key={teamIdx}
                        className="top-team-card glass"
                        style={{
                          padding: "1rem 1.25rem",
                          borderRadius: "14px",
                          border: isTop1
                            ? "1px solid #ffd700"
                            : "1px solid #233458",
                          background: isTop1
                            ? "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(15,23,42,0.9))"
                            : "rgba(15,23,42,0.7)",
                          boxShadow: isTop1
                            ? "0 8px 30px rgba(255,215,0,0.15)"
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.85rem",
                            flexWrap: "wrap",
                            gap: "0.75rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.85rem",
                            }}
                          >
                            <span
                              style={{
                                padding: "4px 12px",
                                borderRadius: "999px",
                                fontSize: "0.85rem",
                                fontWeight: 800,
                                background: isTop1
                                  ? "linear-gradient(135deg, #ffd700, #ff9f1c)"
                                  : "#233458",
                                color: isTop1 ? "#071226" : "#f3f6ff",
                                boxShadow: isTop1
                                  ? "0 0 12px rgba(255,215,0,0.4)"
                                  : "none",
                              }}
                            >
                              {isTop1 ? "#1 BEST" : `#${rankNum}`}
                            </span>
                            <div>
                              <span
                                style={{
                                  fontSize: "1.35rem",
                                  fontWeight: 800,
                                  color: isTop1
                                    ? "#ffd700"
                                    : "var(--text-primary)",
                                }}
                              >
                                {teamItem.simulatedScore.toLocaleString()}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--text-muted)",
                                  marginLeft: "8px",
                                }}
                              >
                                Generic Expected Index
                              </span>
                            </div>
                          </div>

                          <button
                            className="btn-primary"
                            onClick={() => handleApplyRecommendedTeam(teamItem)}
                            style={{
                              padding: "8px 18px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              background: isTop1
                                ? "linear-gradient(135deg, #3a86ff, #4361ee)"
                                : "#233458",
                              border: isTop1 ? "none" : "1px solid #425174",
                            }}
                          >
                            Apply to {currentPreset?.name || "Preset"}
                          </button>
                        </div>

                        {/* 5 Card Avatars */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(5, 1fr)",
                            gap: "0.65rem",
                          }}
                        >
                          {teamItem.team.map((charId, cIdx) => {
                            const char = findChar(charId, characters);
                            const memberCard = getEffectiveCardVariant(
                              char,
                              teamItem.cardIds?.[cIdx],
                            );
                            const isLeader =
                              charId === teamItem.leader ||
                              char?.id === teamItem.leader ||
                              char?.cardData?.id === teamItem.leader;
                            const name =
                              char?.member ||
                              char?.cardData?.member ||
                              char?.name ||
                              char?.cardData?.name ||
                              `Unit ${cIdx + 1}`;
                            const cardTitle =
                              memberCard?.title ||
                              memberCard?.cardData?.name ||
                              "";
                            const type =
                              memberCard?.type ||
                              char?.type ||
                              char?.attribute ||
                              "Pure";
                            const displayImg = memberCard?.assetId
                              ? cardArtUrl(memberCard.assetId)
                              : char?.image ||
                                char?.fallbackImage ||
                                char?.cardData?.image;
                            return (
                              <div
                                key={cIdx}
                                style={{
                                  background: "#0e172a",
                                  border: isLeader
                                    ? "1px solid #ffd700"
                                    : "1px solid #233458",
                                  borderRadius: "10px",
                                  padding: "0.6rem 0.4rem",
                                  textAlign: "center",
                                  position: "relative",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                }}
                              >
                                {isLeader && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      top: "4px",
                                      left: "4px",
                                      background: "#ffd700",
                                      color: "#071226",
                                      fontSize: "0.65rem",
                                      fontWeight: 900,
                                      padding: "1px 5px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    L
                                  </span>
                                )}
                                <div
                                  style={{
                                    width: "46px",
                                    height: "46px",
                                    borderRadius: "50%",
                                    border: `2px solid ${char?.accentColor || "#3b82f6"}`,
                                    overflow: "hidden",
                                    margin: "0 auto 6px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "#1e293b",
                                  }}
                                >
                                  {displayImg ? (
                                    <img
                                      src={displayImg}
                                      alt={name}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        objectPosition: "50% 25%",
                                      }}
                                    />
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: "1.1rem",
                                        fontWeight: 800,
                                        color: char?.accentColor || "#3b82f6",
                                      }}
                                    >
                                      {char?.avatar || name.substring(0, 2)}
                                    </span>
                                  )}
                                </div>
                                <strong
                                  style={{
                                    fontSize: "0.78rem",
                                    color: "var(--text-primary)",
                                    display: "block",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: "100%",
                                  }}
                                >
                                  {name}
                                </strong>
                                {cardTitle && (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      color: "var(--text-secondary)",
                                      display: "block",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: "100%",
                                    }}
                                  >
                                    {cardTitle}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    color: getTypeColor(type),
                                    fontWeight: 600,
                                  }}
                                >
                                  {type}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Leader Outfit summary */}
                        {ldrCard && ldrCard.skills && ldrCard.skills.outfit && (
                          <div
                            style={{
                              marginTop: "0.65rem",
                              padding: "6px 10px",
                              background: "#0b1428",
                              border: "1px solid #233458",
                              borderRadius: "8px",
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            <strong style={{ color: "#ffd700" }}>
                              Leader Outfit ({ldrCard.title || ldrChar?.name}):
                            </strong>{" "}
                            {ldrCard.skills.outfit}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div
              className="modal-footer"
              style={{
                marginTop: "1.5rem",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn-clear-preset"
                onClick={() => setShowRecommendationModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="builder-single-column-layout">
        {/* Row 1: Team Configuration Container */}
        <div
          className="slots-container glass"
          onDragOver={(e) => {
            handleDragOver(e);
            leaderHoverRef.current = !!(
              e.target.closest && e.target.closest(".leader-config-block")
            );
          }}
          onPointerMove={handlePointerMoveOnContainer}
          onPointerUp={handlePointerUpOnContainer}
          onDrop={(e) => {
            // Forgiving fallback: a team-unit drop anywhere in the Current Team
            // section (except on a member slot or the leader block, which have
            // their own handlers) still assigns the dragged unit as leader.
            if (!e.target.closest) return;
            const t = e.target.closest(
              ".builder-slot, .leader-config-block",
            );
            if (t) return;
            handleDropOnLeaderSlot(e);
          }}
        >
          <h2 className="section-title">
            <Users className="title-icon" /> Current Team
          </h2>

          <div
            className="config-grid"
            onDragOver={handleDragOver}
            onDrop={(e) => {
              // Broader fallback: treat any drop that lands inside the leader
              // block (or its immediate padding area) as a leader drop.
              if (e.target.closest && e.target.closest(".leader-config-block")) {
                handleDropOnLeaderSlot(e);
              }
            }}
          >
            {/* {t('leader_slot_title')} */}
            <div
              className="leader-config-block"
              onDragOver={handleDragOver}
              onDrop={handleDropOnLeaderSlot}
            >
              <h4 className="config-block-title">
                <Award size={14} className="text-gold" />{" "}
                {t("leader_slot_title")}
              </h4>

              <div
                className={`leader-slot glass ${leaderChar ? "occupied border-gold" : "empty"} ${activeSlotIndex === "leader" ? "active-focused-slot" : ""}`}
                style={
                  leaderChar
                    ? {
                        "--char-glow": leaderChar.accentColor,
                        cursor: leaderChar ? "grab" : "pointer",
                      }
                    : null
                }
                onClick={() =>
                  setActiveSlotIndex(
                    activeSlotIndex === "leader" ? null : "leader",
                  )
                }
                draggable={!!leaderChar}
                onDragStart={(e) => handleDragStart(e, "leader", null)}
                onDragEnd={handleDragEnd}
              >
                {leaderChar ? (
                  <div className="slot-content">
                    <span className="leader-badge-ribbon">LEADER</span>
                    <div className="slot-img-wrapper border-gold">
                      {leaderChar.image ? (
                        <img
                          src={leaderChar.image}
                          alt={leaderChar.name}
                          className="slot-img"
                        />
                      ) : (
                        <span className="slot-avatar">{leaderChar.avatar}</span>
                      )}
                    </div>
                    <div className="slot-details">
                      <h4 className="slot-name">{leaderChar.name}</h4>
                      <span
                        className="slot-title"
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-secondary)",
                          display: "block",
                          margin: "2px 0",
                        }}
                      >
                        {leaderChar.title}
                      </span>
                      <span className="slot-role">{leaderChar.group}</span>
                      <span
                        className="slot-element"
                        style={{ color: getTypeColor(leaderChar.type) }}
                      >
                        {getTypeIcon(leaderChar.type)}
                        {typeDisplayMap[leaderChar.type] || leaderChar.type}
                      </span>
                    </div>
                    <button
                      className="btn-remove-slot"
                      onClick={handleClearLeader}
                      title="Remove Leader"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="slot-placeholder text-gold">
                    <span className="plus-sign">+</span>
                    <span>
                      {activeSlotIndex === "leader"
                        ? t("selecting_leader_placeholder")
                        : t("empty_leader_placeholder")}
                    </span>
                  </div>
                )}
              </div>
              {activeLeader && (
                <div className="recommendation-badge-container">
                  <div
                    className={`recommendation-badge ${
                      isLeaderInTeam ? "success-badge" : "error-badge"
                    }`}
                  >
                    {isLeaderInTeam ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <AlertTriangle size={12} />
                    )}
                    {isLeaderInTeam
                      ? "Leader provides the Outfit Skill (also in Team Units)"
                      : "Leader provides the Outfit Skill (separate unit)"}
                  </div>
                </div>
              )}
              {!activeLeader && (
                <div className="recommendation-badge-container">
                  <div className="recommendation-badge success-badge">
                    <Award size={12} />
                    No leader set — best in-team outfit is auto-applied
                  </div>
                </div>
              )}
              {activeLeader &&
                leaderChar &&
                (() => {
                  const isLeaderSkillActive = activeSynergies.some(
                    (s) =>
                      s.isLeader &&
                      (s.charId === activeLeader ||
                        (leaderChar &&
                          (s.charId === leaderChar.id ||
                            s.charId === leaderChar.cardData?.id ||
                            s.charId === leaderChar.assetId))),
                  );
                  return (
                    <div
                      className="leader-skill-box glass animate-slide-down"
                      style={{
                        marginTop: "0.75rem",
                        padding: "0.85rem",
                        borderRadius: "10px",
                        border: isLeaderSkillActive
                          ? "1px solid rgba(16, 185, 129, 0.25)"
                          : "1px solid rgba(239, 68, 68, 0.25)",
                        background: isLeaderSkillActive
                          ? "rgba(16, 185, 129, 0.02)"
                          : "rgba(239, 68, 68, 0.02)",
                        textAlign: "left",
                      }}
                    >
                      <h5
                        style={{
                          margin: 0,
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          color: isLeaderSkillActive ? "#10b981" : "#ef4444",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginBottom: "6px",
                        }}
                      >
                        {isLeaderSkillActive ? (
                          <CheckCircle2
                            size={13}
                            style={{ color: "#10b981" }}
                          />
                        ) : (
                          <AlertTriangle
                            size={13}
                            style={{ color: "#ef4444" }}
                          />
                        )}
                        {t("leader_skill")} (Outfit Skill)
                      </h5>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.75rem",
                          color: isLeaderSkillActive
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                          lineHeight: "1.45",
                        }}
                      >
                        {leaderChar.skills.outfit}
                      </p>
                    </div>
                  );
                })()}
            </div>
            {/* Members Slots Grid */}
            <div className="members-config-block">
              <h4 className="config-block-title">
                <Users size={14} /> {t("team_units_title")}
              </h4>
              <div className="slots-grid five-slots">
                {[0, 1, 2, 3, 4].map((index) => {
                  const charId = activeTeam[index];
                  const char = findChar(charId, characters);
                  const isSlotFocused = activeSlotIndex === index;
                  return (
                    <div
                      key={index}
                      className={`builder-slot glass ${char ? "occupied" : "empty"} ${isSlotFocused ? "active-focused-slot" : ""}`}
                      style={
                        char
                          ? {
                              "--char-glow": getTypeColor(char.type),
                              cursor: char ? "grab" : "pointer",
                            }
                          : null
                      }
                      onClick={() =>
                        setActiveSlotIndex(isSlotFocused ? null : index)
                      }
                      draggable={!!char}
                      onDragStart={(e) => handleDragStart(e, "team", index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnTeamSlot(e, index)}
                      onPointerDown={(e) =>
                        handlePointerDownOnTeamSlot(e, index)
                      }
                    >
                      {char ? (
                        <div
                          className="slot-content"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "1rem",
                            padding: "0.4rem 1rem",
                            width: "100%",
                          }}
                        >
                          {leaderChar &&
                            (char.id === activeLeader ||
                              char.id === leaderChar.id) && (
                              <span className="leader-tag-mini">L</span>
                            )}

                          {/* Bigger Avatar Card Icon */}
                          <div
                            className="slot-img-wrapper"
                            style={{
                              width: "76px",
                              height: "108px",
                              minWidth: "76px",
                              aspectRatio: "192 / 272",
                              borderRadius: "12px",
                              overflow: "hidden",
                              border: `2px solid ${getTypeColor(char.type)}`,
                            }}
                          >
                            {char.image ? (
                              <img
                                src={char.image}
                                alt={char.name}
                                className="slot-img"
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  objectPosition: "50% 30%",
                                }}
                              />
                            ) : (
                              <span className="slot-avatar">{char.avatar}</span>
                            )}
                          </div>

                          {/* Slot Details Layout */}
                          <div
                            className="slot-details"
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "minmax(220px, 1.2fr) minmax(100px, 0.8fr) minmax(130px, 1fr)",
                              alignItems: "center",
                              gap: "1.5rem",
                              flex: 1,
                              marginRight: "auto",
                            }}
                          >
                            {/* Column 1: Name, Title, and Lv/Bloom inputs below */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              <div
                                className="slot-name-block"
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                  lineHeight: "1.2",
                                }}
                              >
                                <h4
                                  className="slot-name"
                                  style={{
                                    margin: 0,
                                    fontSize: "0.95rem",
                                    fontWeight: 800,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {char.name}
                                </h4>
                                <span
                                  className="slot-title"
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {char.title}
                                </span>
                              </div>

                              <div
                                className="slot-controls-block"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "center",
                                  marginTop: "2px",
                                }}
                              >
                                <div
                                  style={{
                                    width: "65px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  }}
                                >
                                  <label
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--text-muted)",
                                      margin: 0,
                                      fontWeight: 500,
                                      lineHeight: 1,
                                    }}
                                  >
                                    Lv
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={80}
                                    value={activeLevels[index] || 60}
                                    onChange={(e) =>
                                      handleSlotLevelChange(
                                        index,
                                        e.target.value,
                                      )
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "5px 8px",
                                      fontSize: "13px",
                                      borderRadius: "8px",
                                      background: "#0e172a",
                                      color: "#f3f6ff",
                                      border: "1px solid #233458",
                                      fontWeight: 600,
                                      outline: "none",
                                    }}
                                  />
                                </div>

                                <div
                                  style={{
                                    width: "110px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  }}
                                >
                                  <label
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--text-muted)",
                                      margin: 0,
                                      fontWeight: 500,
                                      lineHeight: 1,
                                    }}
                                  >
                                    Bloom
                                  </label>
                                  <select
                                    value={activeBloomLevels[index] || 0}
                                    onChange={(e) =>
                                      handleSlotBloomChange(
                                        index,
                                        parseInt(e.target.value),
                                      )
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "5px 8px",
                                      fontSize: "13px",
                                      borderRadius: "8px",
                                      background: "#0e172a",
                                      color: "#f3f6ff",
                                      border: "1px solid #233458",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      outline: "none",
                                    }}
                                  >
                                    <option value={0}>Bloom 0</option>
                                    <option value={1}>Bloom 1</option>
                                    <option value={2}>Bloom 2 (+10%)</option>
                                    <option value={3}>Bloom 3</option>
                                    <option value={4}>Bloom 4</option>
                                    <option value={5}>Bloom 5</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* Column 2: Gen (centered vertically) */}
                            <span
                              className="slot-role"
                              style={{
                                fontSize: "0.85rem",
                                color: "var(--text-muted)",
                                textAlign: "center",
                              }}
                            >
                              {char.group}
                            </span>

                            {/* Column 3: Type (centered vertically) */}
                            <span
                              className="slot-element"
                              style={{
                                color: getTypeColor(char.type),
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                justifyContent: "center",
                              }}
                            >
                              {getTypeIcon(char.type)}
                              {typeDisplayMap[char.type] || char.type}
                            </span>
                          </div>

                          <button
                            className="btn-remove-slot"
                            onClick={(e) => handleClearSlot(index, e)}
                            title="Remove"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: "4px",
                              borderRadius: "4px",
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="slot-placeholder">
                          <span className="plus-sign">+</span>
                          <span>
                            {isSlotFocused
                              ? t("selecting_slot_placeholder", {
                                  num: index + 1,
                                })
                              : t("empty_slot_placeholder", { num: index + 1 })}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              className="btn-primary"
              onClick={() => onSavePresets()}
              disabled={activeTeam.filter(Boolean).length === 0}
              style={{
                flex: 1,
                opacity: activeTeam.filter(Boolean).length === 0 ? 0.5 : 1,
              }}
            >
              {t("save_presets")}
            </button>
            <button
              className="btn-primary"
              onClick={handleBestPosition}
              disabled={activeTeam.filter(Boolean).length < 5}
              style={{
                flex: 1,
                opacity: activeTeam.filter(Boolean).length < 5 ? 0.5 : 1,
              }}
            >
              {t("best_order")}
            </button>
          </div>
        </div>
        {/* Row 2: Unified Active Skills List styled like Roster Manager */}
        <div
          className="roster-manager glass"
          style={{ marginTop: "1.25rem", width: "100%" }}
        >
          <div
            className="roster-header"
            onClick={() => setIsActiveExpanded(!isActiveExpanded)}
            style={{ cursor: "pointer" }}
          >
            <div className="roster-header-title-block">
              <h3
                className="section-title-small"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <CheckCircle2 size={16} className="text-green" />
                {t("active_passives")} ({activeCharsCount}/5 {t("characters")})
              </h3>
              <span className="presets-info-text">
                {activeTeam.filter(Boolean).length > 0 || activeLeader
                  ? "Detailed active, special, and passive skill overview for current team members"
                  : t("add_members_msg")}
              </span>
            </div>
            <button
              className="btn-toggle-roster"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              {isActiveExpanded ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </button>
          </div>

          {isActiveExpanded && (
            <div
              className="roster-body animate-slide-down"
              style={{ marginTop: "1rem" }}
            >
              {activeTeam.filter(Boolean).length > 0 || activeLeader ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {/* Leader first, then team members (skip the leader's own
                      team slot so an in-team leader isn't listed twice) */}
                  {[activeLeader, ...activeTeam]
                    .filter(Boolean)
                    .map((charId, idx) => {
                      if (
                        idx !== 0 &&
                        sameChar(charId, activeLeader, characters)
                      )
                        return null;
                      const char = findChar(charId, characters);
                      if (!char) return null;

                      const isLeader =
                        charId === activeLeader ||
                        (leaderChar &&
                          (char.id === leaderChar.id ||
                            char.cardData?.id === leaderChar.cardData?.id ||
                            char.assetId === leaderChar.assetId));
                      if (!isLeader && idx === 0 && activeLeader) return null;

                      const slotIdx = activeTeam.findIndex(
                        (id) =>
                          id === charId ||
                          id === char.id ||
                          id === char.assetId ||
                          id === char.cardData?.id,
                      );
                      const effectiveCard = getEffectiveCardVariant(
                        char,
                        slotIdx !== -1 ? activeSelectedCards[slotIdx] : null,
                      );
                      const bStage =
                        slotIdx !== -1 ? activeBloomLevels[slotIdx] || 0 : 0;

                      const isActivePassive = activeSynergies.some(
                        (s) =>
                          s.charId === char.id ||
                          s.charId === char.cardData?.id ||
                          s.charId === char.assetId ||
                          (isLeader && s.isLeader),
                      );
                      const passiveText = getSkillTextForStage(
                        effectiveCard,
                        "passive",
                        bStage,
                      );
                      const activeText = getSkillTextForStage(
                        effectiveCard,
                        "active",
                        bStage,
                      );
                      const specialText = getSkillTextForStage(
                        effectiveCard,
                        "special",
                        bStage,
                      );

                      return (
                        <div
                          key={char.id || idx}
                          className="synergy-bonus-item glass"
                          style={{
                            padding: "0.85rem",
                            borderRadius: "10px",
                            border: "1px solid var(--border-color)",
                            display: "block",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "8px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <span
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background: char.accentColor || "#38bdf8",
                                }}
                              />
                              <strong
                                style={{
                                  fontSize: "0.9rem",
                                  color: "var(--text-primary)",
                                }}
                              >
                                {effectiveCard.title
                                  ? `${char.name || effectiveCard.member} - ${effectiveCard.title}`
                                  : char.name || effectiveCard.member}
                              </strong>
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  color: isLeader
                                    ? "#ffb703"
                                    : "var(--text-muted)",
                                  fontWeight: 700,
                                }}
                              >
                                {isLeader
                                  ? `(${t("leader_tag")})`
                                  : `(${t("member_tag")})`}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  color: "#a855f7",
                                  fontWeight: 800,
                                  background: "rgba(168,85,247,0.08)",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(168,85,247,0.2)",
                                }}
                              >
                                {effectiveCard.rarity || 5}★ •{" "}
                                {effectiveCard.type || effectiveCard.attribute}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  color: "#ffb703",
                                  fontWeight: 800,
                                  background: "rgba(255,183,3,0.08)",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(255,183,3,0.2)",
                                }}
                              >
                                Bloom {bStage}
                              </span>
                            </div>

                            {/* Passive status indicator */}
                            {passiveText && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  background: isActivePassive
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : "rgba(255, 183, 3, 0.05)",
                                  color: isActivePassive
                                    ? "#10b981"
                                    : "var(--text-muted)",
                                  border: isActivePassive
                                    ? "1px solid rgba(16, 185, 129, 0.2)"
                                    : "1px solid var(--border-color)",
                                }}
                              >
                                {isActivePassive
                                  ? "ALL SKILLS ACTIVE"
                                  : "SKILLS INACTIVE"}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "0.75rem",
                              marginBottom: passiveText ? "0.75rem" : 0,
                            }}
                          >
                            <div
                              style={{
                                background: "rgba(255,255,255,0.01)",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                border: "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 800,
                                  color: char.accentColor,
                                  marginBottom: "3px",
                                  textTransform: "uppercase",
                                }}
                              >
                                {t("special_skill")}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--text-primary)",
                                  lineHeight: "1.4",
                                }}
                              >
                                {specialText}
                              </div>
                            </div>
                            <div
                              style={{
                                background: "rgba(255,255,255,0.01)",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                border: "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 800,
                                  color: char.accentColor,
                                  marginBottom: "3px",
                                  textTransform: "uppercase",
                                }}
                              >
                                {t("active_skill")}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--text-primary)",
                                  lineHeight: "1.4",
                                }}
                              >
                                {activeText}
                              </div>
                            </div>
                          </div>
                          {passiveText && (
                            <div
                              style={{
                                background: isActivePassive
                                  ? "rgba(16, 185, 129, 0.02)"
                                  : "rgba(255,255,255,0.01)",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                border: isActivePassive
                                  ? "1px solid rgba(16, 185, 129, 0.1)"
                                  : "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 800,
                                  color: char.accentColor,
                                  marginBottom: "3px",
                                  textTransform: "uppercase",
                                }}
                              >
                                {t("passive_skill")}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: isActivePassive
                                    ? "var(--text-primary)"
                                    : "var(--text-muted)",
                                  lineHeight: "1.4",
                                }}
                              >
                                {passiveText}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div
                  className="empty-analytics"
                  style={{ padding: "2rem 1rem" }}
                >
                  <AlertCircle size={24} className="text-muted" />
                  <p>{t("add_members_msg")}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 3: Detailed Score Calculation Breakdowns panel */}
        <div
          className="roster-manager glass"
          style={{ marginTop: "1.25rem", width: "100%" }}
        >
          <div
            className="roster-header"
            onClick={() => setIsDetailedMathExpanded(!isDetailedMathExpanded)}
            style={{ cursor: "pointer" }}
          >
            <div className="roster-header-title-block">
              <h3
                className="section-title-small"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <CheckCircle2 size={16} className="text-gold" />
                {t("detailed_score_breakdowns")}
              </h3>
              <span className="presets-info-text">
                {activeTeam.filter(Boolean).length > 0 || activeLeader
                  ? t("detailed_score_desc")
                  : t("add_members_calc_msg")}
              </span>
            </div>
            <button
              className="btn-toggle-roster"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              {isDetailedMathExpanded ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </button>
          </div>

          {isDetailedMathExpanded && (
            <div
              className="roster-body animate-slide-down"
              style={{ marginTop: "1rem" }}
            >
              {activeTeam.filter(Boolean).length > 0 || activeLeader ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                  }}
                >
                  {(() => {
                    const summary = getTeamCalculationSummary(
                      activeTeam,
                      activeLeader,
                      characters,
                      activeBloomLevels,
                      activeLevels,
                      activeSelectedCards,
                    );
                    if (!summary) return null;
                    return (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "1.25rem",
                        }}
                      >
                        {/* Top Header Card & Roster Cards Grid matching Reference UI */}
                        <div
                          style={{
                            background: "#0b1329",
                            border: "1px solid #1e293b",
                            borderRadius: "12px",
                            padding: "1.25rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: "1rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                              }}
                            >
                              <span
                                style={{
                                  background: "#10b981",
                                  color: "#000",
                                  fontWeight: 900,
                                  fontSize: "0.85rem",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                }}
                              >
                                #1
                              </span>
                              <h2
                                style={{
                                  margin: 0,
                                  fontSize: "1.6rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.expectedIndex.toLocaleString()}
                              </h2>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#94a3b8",
                                }}
                              >
                                Generic Expected Index
                              </span>
                            </div>
                          </div>

                          {/* 5 Roster Card Thumbnails */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(5, 1fr)",
                              gap: "0.75rem",
                              marginBottom: "1rem",
                            }}
                          >
                            {summary.cards.map((card, idx) => {
                              const charObj = findChar(card.id, characters);
                              const bStage = activeBloomLevels[idx] || 0;
                              const cLvl = activeLevels[idx] || 70;
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    background: "#0f172a",
                                    border: "1px solid #1e293b",
                                    borderRadius: "10px",
                                    padding: "0.75rem 0.5rem",
                                    textAlign: "center",
                                    position: "relative",
                                  }}
                                >
                                  <span
                                    style={{
                                      position: "absolute",
                                      top: "6px",
                                      left: "6px",
                                      width: "20px",
                                      height: "20px",
                                      background: "#0f172a",
                                      border: "1px solid #334155",
                                      borderRadius: "50%",
                                      fontSize: "0.7rem",
                                      fontWeight: 800,
                                      color: "#f8fafc",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {idx + 1}
                                  </span>
                                  <div
                                    style={{
                                      width: "64px",
                                      height: "64px",
                                      borderRadius: "14px",
                                      overflow: "hidden",
                                      margin: "0 auto 8px",
                                      border: "2px solid #3b82f6",
                                    }}
                                  >
                                    {charObj?.image ? (
                                      <img
                                        src={
                                          charObj.fallbackImage || charObj.image
                                        }
                                        alt={card.member}
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          background: "#1e293b",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "#60a5fa",
                                          fontWeight: 800,
                                          fontSize: "1.2rem",
                                        }}
                                      >
                                        {card.member?.substring(0, 2)}
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.82rem",
                                      fontWeight: 800,
                                      color: "#f8fafc",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {card.member}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.7rem",
                                      color: "#94a3b8",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    {charObj?.title || "SSR Card"}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.68rem",
                                      color: "#64748b",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {charObj?.type || "Pure"} · Lv{cLvl} · B
                                    {bStage}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Leader Outfit Used Box */}
                          {summary.leaderChar && (
                            <div
                              style={{
                                background: "#090e1a",
                                border: "1px solid #1e293b",
                                borderRadius: "8px",
                                padding: "0.6rem 0.85rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                              }}
                            >
                              <div
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "8px",
                                  overflow: "hidden",
                                  border: "1px solid #f59e0b",
                                  flexShrink: 0,
                                }}
                              >
                                {summary.leaderChar.image ? (
                                  <img
                                    src={
                                      summary.leaderChar.fallbackImage ||
                                      summary.leaderChar.image
                                    }
                                    alt={summary.leaderChar.name}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      background: "#f59e0b",
                                      color: "#000",
                                      fontWeight: 800,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    L
                                  </div>
                                )}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.65rem",
                                      fontWeight: 800,
                                      color: "#94a3b8",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                    }}
                                  >
                                    OUTFIT USED
                                  </span>
                                  {summary.outfitLeaderAuto && (
                                    <span
                                      style={{
                                        fontSize: "0.55rem",
                                        fontWeight: 800,
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                        background: "#f59e0b",
                                        color: "#000",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px",
                                      }}
                                    >
                                      Auto
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.85rem",
                                    fontWeight: 800,
                                    color: "#ffffff",
                                  }}
                                >
                                  {summary.leaderChar.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#cbd5e1",
                                  }}
                                >
                                  {summary.outfitLeaderAuto
                                    ? "Best in-team outfit auto-applied (no leader set)"
                                    : (summary.leaderChar.skills?.outfit ||
                                        "Leader outfit effect active")}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 6 KPI Stat Cards Grid */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(6, 1fr)",
                              gap: "0.6rem",
                              marginTop: "1rem",
                            }}
                          >
                            <div
                              style={{
                                background: "#0f172a",
                                padding: "10px 8px",
                                borderRadius: "8px",
                                border: "1px solid #1e293b",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  display: "block",
                                }}
                              >
                                TEAM STAT
                              </span>
                              <h4
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "1.05rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.totalTeamStat.toLocaleString()}
                              </h4>
                            </div>
                            <div
                              style={{
                                background: "#0f172a",
                                padding: "10px 8px",
                                borderRadius: "8px",
                                border: "1px solid #1e293b",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  display: "block",
                                }}
                              >
                                TOTAL BONUS
                              </span>
                              <h4
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "1.05rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.totalBonusPct}
                              </h4>
                            </div>
                            <div
                              style={{
                                background: "#0f172a",
                                padding: "10px 8px",
                                borderRadius: "8px",
                                border: "1px solid #1e293b",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  display: "block",
                                }}
                              >
                                ACTIVE
                              </span>
                              <h4
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "1.05rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.activePct}
                              </h4>
                            </div>
                            <div
                              style={{
                                background: "#0f172a",
                                padding: "10px 8px",
                                borderRadius: "8px",
                                border: "1px solid #1e293b",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  display: "block",
                                }}
                              >
                                SUPPORT
                              </span>
                              <h4
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "1.05rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.supportPct}
                              </h4>
                            </div>
                            <div
                              style={{
                                background: "#0f172a",
                                padding: "10px 8px",
                                borderRadius: "8px",
                                border: "1px solid #1e293b",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  display: "block",
                                }}
                              >
                                SAR
                              </span>
                              <h4
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "1.05rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.sarPct}
                              </h4>
                            </div>
                            <div
                              style={{
                                background: "#0f172a",
                                padding: "10px 8px",
                                borderRadius: "8px",
                                border: "1px solid #1e293b",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  display: "block",
                                }}
                              >
                                SPECIAL SUPPORT
                              </span>
                              <h4
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "1.05rem",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                }}
                              >
                                {summary.specialSupportPct}
                              </h4>
                            </div>
                          </div>
                        </div>

                        {/* Team Details Section */}
                        <div
                          style={{
                            background: "#0b1329",
                            border: "1px solid #1e293b",
                            borderRadius: "12px",
                            padding: "1.25rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "1rem",
                            }}
                          >
                            <h3
                              style={{
                                margin: 0,
                                fontSize: "1rem",
                                fontWeight: 800,
                                color: "#ffffff",
                              }}
                            >
                              Team details
                            </h3>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "#64748b",
                                cursor: "pointer",
                              }}
                            >
                              Readable skill summary
                            </span>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "1.25rem",
                            }}
                          >
                            {/* Passive effects Left Panel */}
                            <div
                              style={{
                                background: "#0f172a",
                                border: "1px solid #1e293b",
                                borderRadius: "10px",
                                padding: "1rem",
                              }}
                            >
                              <h4
                                style={{
                                  margin: "0 0 0.85rem",
                                  fontSize: "0.85rem",
                                  fontWeight: 800,
                                  color: "#f8fafc",
                                }}
                              >
                                Passive effects
                              </h4>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.65rem",
                                }}
                              >
                                {summary.passiveEffects.map((eff, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      background: "rgba(255,255,255,0.02)",
                                      border:
                                        "1px solid rgba(255,255,255,0.04)",
                                      borderRadius: "6px",
                                      padding: "8px 10px",
                                      fontSize: "0.75rem",
                                      color: "#cbd5e1",
                                      lineHeight: "1.4",
                                    }}
                                  >
                                    {eff.text}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Skill summary by position Right Panel */}
                            <div
                              style={{
                                background: "#0f172a",
                                border: "1px solid #1e293b",
                                borderRadius: "10px",
                                padding: "1rem",
                                overflowX: "auto",
                              }}
                            >
                              <h4
                                style={{
                                  margin: "0 0 0.85rem",
                                  fontSize: "0.85rem",
                                  fontWeight: 800,
                                  color: "#f8fafc",
                                }}
                              >
                                Skill summary by position
                              </h4>
                              <table
                                style={{
                                  width: "100%",
                                  borderCollapse: "collapse",
                                  fontSize: "0.78rem",
                                  textAlign: "left",
                                }}
                              >
                                <thead>
                                  <tr
                                    style={{
                                      borderBottom: "1px solid #334155",
                                      color: "#94a3b8",
                                    }}
                                  >
                                    <th style={{ padding: "8px 6px" }}>Pos.</th>
                                    <th style={{ padding: "8px 6px" }}>
                                      Member
                                    </th>
                                    <th
                                      style={{
                                        padding: "8px 6px",
                                        textAlign: "right",
                                      }}
                                    >
                                      Proc
                                    </th>
                                    <th
                                      style={{
                                        padding: "8px 6px",
                                        textAlign: "right",
                                      }}
                                    >
                                      Active
                                    </th>
                                    <th
                                      style={{
                                        padding: "8px 6px",
                                        textAlign: "right",
                                      }}
                                    >
                                      Special support
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {summary.positionDetails.map((pos) => (
                                    <tr
                                      key={pos.pos}
                                      style={{
                                        borderBottom:
                                          "1px solid rgba(255,255,255,0.04)",
                                        color: "#f8fafc",
                                      }}
                                    >
                                      <td
                                        style={{
                                          padding: "8px 6px",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {pos.pos}
                                      </td>
                                      <td
                                        style={{
                                          padding: "8px 6px",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {pos.name}
                                      </td>
                                      <td
                                        style={{
                                          padding: "8px 6px",
                                          textAlign: "right",
                                          color: "#cbd5e1",
                                        }}
                                      >
                                        {pos.procRate}
                                      </td>
                                      <td
                                        style={{
                                          padding: "8px 6px",
                                          textAlign: "right",
                                          color: "#cbd5e1",
                                        }}
                                      >
                                        {pos.activeMag}
                                      </td>
                                      <td
                                        style={{
                                          padding: "8px 6px",
                                          textAlign: "right",
                                          color: "#cbd5e1",
                                        }}
                                      >
                                        {pos.specialMag}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Cards for each character */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: "1rem",
                    }}
                  >
                    {(() => {
                      const details = getTeamCalculationDetails(
                        activeTeam,
                        activeLeader,
                        characters,
                        activeBloomLevels,
                        activeLevels,
                        activeSelectedCards,
                      );
                      const teamInfo = details.team;
                      return (
                        <>
                          {details.map((d) => (
                            <div
                              key={d.id}
                              className="synergy-bonus-item glass"
                              style={{
                                padding: "1rem",
                                borderRadius: "10px",
                                border: "1px solid var(--border-color)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  marginBottom: "12px",
                                }}
                              >
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: d.accentColor,
                                  }}
                                />
                                <strong
                                  style={{
                                    fontSize: "0.95rem",
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {d.name} - {t("calculation_math")}
                                </strong>
                                {d.outfitLeader && (
                                  <span
                                    style={{
                                      background: "#10b981",
                                      color: "#000",
                                      fontWeight: 800,
                                      fontSize: "0.68rem",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    {t("outfit_leader")}
                                  </span>
                                )}
                                <span
                                  style={{
                                    marginLeft: "auto",
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {t("position")}: #{d.position}
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--text-secondary)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                  lineHeight: "1.5",
                                }}
                              >
                                <div>
                                  <strong
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {t("final_stats_math")}:
                                  </strong>
                                  <div
                                    style={{
                                      paddingLeft: "10px",
                                      marginTop: "2px",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    Sense: {d.stats.sense.raw.toLocaleString()}{" "}
                                    * (1 + {d.stats.sense.buff.toFixed(2)}) ={" "}
                                    {Math.round(
                                      d.stats.sense.final,
                                    ).toLocaleString()}
                                    <br />
                                    Technique:{" "}
                                    {d.stats.technique.raw.toLocaleString()} *
                                    (1 + {d.stats.technique.buff.toFixed(2)}) ={" "}
                                    {Math.round(
                                      d.stats.technique.final,
                                    ).toLocaleString()}
                                    <br />
                                    Performance:{" "}
                                    {d.stats.performance.raw.toLocaleString()} *
                                    (1 + {d.stats.performance.buff.toFixed(2)})
                                    ={" "}
                                    {Math.round(
                                      d.stats.performance.final,
                                    ).toLocaleString()}
                                  </div>
                                  {(() => {
                                    const src = d.statBuffSources;
                                    const lines = [];
                                    if (src.sense.length)
                                      lines.push(
                                        `Sense: ${src.sense.join("; ")}`,
                                      );
                                    if (src.technique.length)
                                      lines.push(
                                        `Technique: ${src.technique.join("; ")}`,
                                      );
                                    if (src.performance.length)
                                      lines.push(
                                        `Performance: ${src.performance.join("; ")}`,
                                      );
                                    if (src.all.length)
                                      lines.push(`All: ${src.all.join("; ")}`);
                                    if (src.support.length)
                                      lines.push(
                                        `Support: ${src.support.join("; ")}`,
                                      );
                                    if (src.outfit.length)
                                      lines.push(
                                        `Outfit: ${src.outfit.join("; ")}`,
                                      );
                                    return lines.length > 0 ? (
                                      <div
                                        style={{
                                          paddingLeft: "10px",
                                          marginTop: "4px",
                                          fontSize: "0.72rem",
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        {lines.map((l) => (
                                          <div key={l}>{l}</div>
                                        ))}
                                      </div>
                                    ) : null;
                                  })()}
                                </div>

                                <div>
                                  <strong
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {t("overall_power_math")}:
                                  </strong>
                                  <div
                                    style={{
                                      paddingLeft: "10px",
                                      marginTop: "2px",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {Math.round(
                                      d.stats.sense.final,
                                    ).toLocaleString()}{" "}
                                    (Sense) +{" "}
                                    {Math.round(
                                      d.stats.technique.final,
                                    ).toLocaleString()}{" "}
                                    (Tech) +{" "}
                                    {Math.round(
                                      d.stats.performance.final,
                                    ).toLocaleString()}{" "}
                                    (Perf) ={" "}
                                    {Math.round(
                                      d.overallPower,
                                    ).toLocaleString()}{" "}
                                    {t("power")}
                                  </div>
                                </div>

                                <div>
                                  <strong
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {t("active_uptime_math")}:
                                  </strong>
                                  <div
                                    style={{
                                      paddingLeft: "10px",
                                      marginTop: "2px",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {t("triggers_in")}: Math.floor({SONG} /{" "}
                                    {d.uptime.interval}) = {d.uptime.triggers}
                                    <br />
                                    {t("trigger_rate")}:{" "}
                                    {Math.round(
                                      d.uptime.baseActivationRate * 100,
                                    )}
                                    % base +{" "}
                                    {Math.round(
                                      (d.uptime.triggerRate -
                                        d.uptime.baseActivationRate) *
                                        100,
                                    )}
                                    % buff ={" "}
                                    {Math.round(d.uptime.triggerRate * 100)}%
                                    {d.conditionalBuff != null && (
                                      <>
                                        <br />
                                        {t("effective_magnitude")}:{" "}
                                        {Math.round(d.effectiveActiveMag * 100)}
                                        % (
                                        {d.conditionMet
                                          ? t("condition_met")
                                          : t("condition_not_met")}
                                        )
                                      </>
                                    )}
                                    <br />
                                    {t("uptime_ratio")}: ({d.uptime.triggers}{" "}
                                    triggers * {d.uptime.duration}s duration *{" "}
                                    {Math.round(d.uptime.triggerRate * 100)}%
                                    trigger rate) / {SONG}s ={" "}
                                    {(d.uptime.uptimeRatio * 100).toFixed(1)}%
                                  </div>
                                </div>

                                <div>
                                  <strong
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {t("score_bonus_math")}:
                                  </strong>
                                  <div
                                    style={{
                                      paddingLeft: "10px",
                                      marginTop: "2px",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {t("active_contribution")}:{" "}
                                    {Math.round(d.effectiveActiveMag * 100)}%
                                    effective buff x{" "}
                                    {Math.round(d.uptime.triggerRate * 100)}%
                                    rate x overlap/priority = +
                                    {d.activeContribution.toFixed(2)}
                                    % of team score
                                    <br />
                                    {t("special_contribution")}:{" "}
                                    {Math.round(d.specialBuff * 100)}% buff x{" "}
                                    {d.specialDuration}s window x position
                                    weight = +{d.specialContribution.toFixed(2)}
                                    % of team score
                                    {d.sarContribution !== 0 && (
                                      <>
                                        <br />
                                        {t("sar_contribution")}:{" "}
                                        {Math.round(d.sarPct * 100)}% rate-up
                                        uplift (incl. support) = +
                                        {d.sarContribution.toFixed(2)}% of team
                                        score
                                      </>
                                    )}
                                    <br />
                                    {t("total_expected_bonus")}: +
                                    {d.activeContribution.toFixed(2)}% +{" "}
                                    {d.specialContribution.toFixed(2)}%
                                    {d.sarContribution !== 0
                                      ? ` + ${d.sarContribution.toFixed(2)}%`
                                      : ""}{" "}
                                    = +{(d.totalBonus * 100).toFixed(2)}%
                                  </div>
                                </div>

                                <div
                                  style={{
                                    borderTop:
                                      "1px solid rgba(255,255,255,0.04)",
                                    paddingTop: "6px",
                                    marginTop: "4px",
                                  }}
                                >
                                  <strong
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {t("final_unit_score_math")}:
                                  </strong>
                                  <div
                                    style={{
                                      paddingLeft: "10px",
                                      marginTop: "2px",
                                      fontWeight: "bold",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {Math.round(
                                      d.overallPower,
                                    ).toLocaleString()}{" "}
                                    Power * (1 + {d.totalBonus.toFixed(4)}) ={" "}
                                    {d.unitScore.toLocaleString()} Unit Score
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {teamInfo && (
                            <div
                              style={{
                                borderTop: "1px solid rgba(255,255,255,0.06)",
                                paddingTop: "0.75rem",
                                fontSize: "0.78rem",
                                color: "var(--text-muted)",
                                lineHeight: "1.6",
                              }}
                            >
                              <strong style={{ color: "var(--text-primary)" }}>
                                {t("team_score_recon")}:
                              </strong>{" "}
                              Team Stat (sum of final stats; outfit leader:{" "}
                              {teamInfo.outfitLeaderName || "—"}) ={" "}
                              {Math.round(teamInfo.stat).toLocaleString()} x (1
                              + {teamInfo.totalBonus.toFixed(4)}) ={" "}
                              {teamInfo.score.toLocaleString()}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div
                  className="empty-analytics"
                  style={{ padding: "2rem 1rem" }}
                >
                  <AlertCircle size={24} className="text-muted" />
                  <p>{t("add_members_msg")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Roster Character Selection Popup Modal */}
      {activeSlotIndex !== null && (
        <div className="modal-overlay" onClick={() => setActiveSlotIndex(null)}>
          <div
            className="modal-content glass animate-scale-up"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "1150px", width: "95%" }}
          >
            <div className="modal-header">
              <div
                className="modal-header-title"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Users size={20} className="text-gold" />
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800 }}>
                  {activeSlotIndex === "leader"
                    ? "Select Team Leader"
                    : `Select Unit for Slot ${activeSlotIndex + 1}`}
                </h2>
              </div>
              <button
                className="btn-close-modal"
                onClick={() => setActiveSlotIndex(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                maxHeight: "65vh",
                overflowY: "auto",
                padding: "1.5rem",
              }}
            >
              <div
                className="roster-header-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.5rem",
                  gap: "15px",
                }}
              >
                <p className="presets-info-text" style={{ margin: 0 }}>
                  {activeSlotIndex === "leader"
                    ? "Assign a leader to activate their leader synergy bonuses."
                    : `Choose a member card to occupy Slot ${activeSlotIndex + 1}.`}
                </p>
                <input
                  type="text"
                  placeholder={t("search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="roster-search-input glass"
                  style={{
                    width: "250px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.2)",
                    color: "#fff",
                  }}
                  autoFocus
                />
              </div>
              <div
                className="character-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(225px, 1fr))",
                  gap: "1rem",
                  marginTop: "1rem",
                }}
              >
                {filteredRoster.map((char) => {
                  const isSelected = activeTeam.some((id) =>
                    sameChar(id, char.id, characters),
                  );
                  return (
                    <div
                      key={char.id}
                      className={`char-card glass ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelectCharacter(char.id)}
                      style={{
                        "--hover-color": char.accentColor,
                        cursor: "pointer",
                        position: "relative",
                        border: isSelected
                          ? `2px solid ${getTypeColor(char.type)}`
                          : "1px solid rgba(255,255,255,0.08)",
                        background: isSelected
                          ? `${char.accentColor}10`
                          : "rgba(255,255,255,0.02)",
                        boxShadow: isSelected
                          ? `0 0 15px ${char.accentColor}30`
                          : "none",
                        transform: "none",
                        margin: 0,
                      }}
                    >
                      <div className="rarity-badge">{char.rarity}</div>
                      <div
                        className="char-card-body"
                        style={{ padding: "0.5rem" }}
                      >
                        <div
                          className="char-card-media-wrapper"
                          style={{
                            width: "75px",
                            height: "75px",
                            borderRadius: "50%",
                            overflow: "hidden",
                            border: `2px solid ${char.accentColor}`,
                            marginBottom: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.2))",
                          }}
                        >
                          {char.image ? (
                            <img
                              src={char.fallbackImage || char.image}
                              alt={char.name}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              className="char-card-avatar-fallback"
                              style={{ fontSize: "1.6rem", fontWeight: "bold" }}
                            >
                              {char.avatar}
                            </div>
                          )}
                        </div>
                        <h3
                          className="char-card-name"
                          style={{
                            fontSize: "1.05rem",
                            fontWeight: "700",
                            marginBottom: "4px",
                          }}
                        >
                          {char.name}
                        </h3>
                        <p
                          className="char-card-title"
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-secondary)",
                            marginBottom: "12px",
                          }}
                        >
                          {char.title}
                        </p>

                        <div
                          className="char-card-badges"
                          style={{
                            flexWrap: "nowrap",
                            gap: "0.4rem",
                            justifyContent: "center",
                            width: "100%",
                          }}
                        >
                          <span
                            className="badge-role"
                            style={{
                              whiteSpace: "nowrap",
                              padding: "0.25rem 0.45rem",
                            }}
                          >
                            <Users size={10} className="mr-1" />
                            {char.group}
                          </span>
                          <span
                            className="badge-elem"
                            style={{
                              color: getTypeColor(char.type),
                              whiteSpace: "nowrap",
                              padding: "0.25rem 0.45rem",
                            }}
                          >
                            {getTypeIcon(char.type)}
                            {typeDisplayMap[char.type] || char.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
