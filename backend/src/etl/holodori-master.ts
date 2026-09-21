/**
 * Builds the "normalized-card-v2" card pack straight from the HolodoriDB master
 * data (HolodoriDB/holodori-db-eng-diff).
 *
 * Why: the site used to read its card catalog out of another project's
 * bundled index.html (a ~23 MB file that only changes when that maintainer cuts
 * a release). Master data lands days-to-weeks earlier, so new cards were missing
 * from the site until someone else updated their release. The conversion below
 * is deterministic — every effect/trigger/target is a row in the master tables —
 * and was validated field-for-field (bit-exact numbers and text) against all 174
 * cards of the previous pack before this replaced it as the primary source.
 *
 * The output has exactly the shape packedToLegacySnapshot() consumes.
 */

import config from "../config.js";

export const MASTER_BASE_URL = config.masterBaseUrl;

const MASTER_TIMEOUT_MS = Number(process.env.HOLODORI_FETCH_TIMEOUT_MS) || 120_000;

// Tables (and English language tables) the conversion reads.
export const MASTER_TABLES = [
  "Card",
  "Character",
  "CharacterGrouping",
  "CardLevel",
  "CardLevelLimit",
  "CardPotential",
  "LiveActiveSkillLevel",
  "LiveActiveSkillEffect",
  "LivePassiveSkillLevel",
  "LivePassiveSkillEffect",
  "LiveSpecialSkillLevel",
  "LiveSkillTrigger",
  "LiveSkillEffectTarget",
  "LiveLeaderSkill",
  "LangCard_Eng",
  "LangCharacterGrouping_Eng",
  "LangGeneratedLiveActiveSkillLevel_Eng",
  "LangGeneratedLivePassiveSkillLevel_Eng",
  "LangGeneratedLiveSpecialSkillLevel_Eng",
  "LangGeneratedLiveLeaderSkill_Eng",
] as const;

export type MasterTables = Record<string, any[]>;

const fetchOk = async (url: string): Promise<Response> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(MASTER_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HolodoriDB fetch failed: ${url} -> HTTP ${res.status}`);
  return res;
};

export async function fetchMasterTables(): Promise<{ version: string; tables: MasterTables }> {
  const [version, ...loaded] = await Promise.all([
    fetchOk(`${MASTER_BASE_URL}/version.txt`).then((r) => r.text()),
    ...MASTER_TABLES.map((name) => fetchOk(`${MASTER_BASE_URL}/${name}.json`).then((r) => r.json())),
  ]);
  const tables: MasterTables = {};
  MASTER_TABLES.forEach((name, i) => {
    tables[name] = loaded[i] as any[];
  });
  return { version: String(version).trim(), tables };
}

// --- conversion ------------------------------------------------------------

const enumTail = (s: string): string => s.slice(s.indexOf("TYPE_") + "TYPE_".length);

const PASSIVE_KIND: Record<string, string> = {
  ALL_PARAMETER_UP_PERMIL_UP: "all",
  PERFORMANCE_UP_PERMIL_UP: "perf",
  TECHNIQUE_UP_PERMIL_UP: "tech",
  SENSE_UP_PERMIL_UP: "sense",
  LIVE_ACTIVE_SKILL_EFFECT_UP_PERMIL_UP: "support",
};

const CHANCE_LABEL: Record<string, string> = { High: "H", Medium: "M", Low: "L" };

// Same labels the optimizer pack shipped (and holodori.best displays).
export const ATTRIBUTE_LABELS: Record<string, string> = {
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_1: "Cute",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2: "Pure",
  CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_3: "Happy",
};

// Description strings carry UI markup such as [highlight]45[/highlight] and
// [attribute=pure]Pure Type[/attribute].
const cleanText = (s: unknown): string =>
  String(s ?? "")
    .replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/g, "")
    .trim();

const groupBy = <T>(rows: T[], key: (r: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
};

export interface BuildResult {
  packed: any;
  /** Cards that could not be converted (unknown effect type etc.), with the reason. */
  skipped: { assetId: string; reason: string }[];
}

export function buildPackedFromMaster(version: string, t: MasterTables): BuildResult {
  const lang = new Map<string, string>();
  for (const name of [
    "LangCard_Eng",
    "LangGeneratedLiveActiveSkillLevel_Eng",
    "LangGeneratedLivePassiveSkillLevel_Eng",
    "LangGeneratedLiveSpecialSkillLevel_Eng",
    "LangGeneratedLiveLeaderSkill_Eng",
  ]) {
    for (const r of t[name] ?? []) lang.set(r.id, r.data.text);
  }

  const characters = new Map<string, any>((t.Character ?? []).map((r) => [r.id, r.data]));
  const groupings: any[] = (t.CharacterGrouping ?? []).map((r) => r.data);

  const levelsOf = (rows: any[], idKey: string) => {
    const out = new Map<string, Map<number, any>>();
    for (const r of rows) {
      const id = r[idKey];
      if (!out.has(id)) out.set(id, new Map());
      out.get(id)!.set(Number(r.level), r.data);
    }
    return out;
  };
  const activeLv = levelsOf(t.LiveActiveSkillLevel ?? [], "live_active_skill_id");
  const passiveLv = levelsOf(t.LivePassiveSkillLevel ?? [], "live_passive_skill_id");
  const specialLv = levelsOf(t.LiveSpecialSkillLevel ?? [], "live_special_skill_id");
  const activeEffects = groupBy(t.LiveActiveSkillEffect ?? [], (r) => r.group_id);
  const passiveEffects = groupBy(t.LivePassiveSkillEffect ?? [], (r) => r.group_id);
  const triggers = groupBy(t.LiveSkillTrigger ?? [], (r) => r.group_id);
  const targets = new Map<string, any>((t.LiveSkillEffectTarget ?? []).map((r) => [r.id, r.data]));
  const leaders = new Map<string, any>((t.LiveLeaderSkill ?? []).map((r) => [r.id, r.data]));

  const numericTable = (rows: any[], groupKey: string, orderKey: string) => {
    const out = new Map<string, Map<number, any>>();
    for (const r of rows) {
      const g = r[groupKey];
      if (!out.has(g)) out.set(g, new Map());
      out.get(g)!.set(Number(r[orderKey]), r.data);
    }
    return out;
  };
  const cardLevel = numericTable(t.CardLevel ?? [], "group_id", "level");
  const levelLimit = numericTable(t.CardLevelLimit ?? [], "group_id", "limit_break_count");
  const potential = numericTable(t.CardPotential ?? [], "group_id", "upgrade_count");

  const sorted = <V>(m: Map<number, V> | undefined): [number, V][] =>
    [...(m ?? new Map<number, V>()).entries()].sort((a, b) => a[0] - b[0]);

  const trigger = (id: string | undefined | null): any => {
    if (!id) return null;
    const r = triggers.get(id)?.[0]?.data;
    if (!r) throw new Error(`unknown trigger group ${id}`);
    const type = enumTail(r.type);
    if (type === "COMBO_GTE" || type === "LIFE_GTE") {
      return { kind: type.toLowerCase(), threshold: Number(r.threshold) };
    }
    if (type === "DECK_CARD_ATTRIBUTE") {
      return { kind: "attribute", id: r.cardAttributeType, count: Number(r.threshold || 1) };
    }
    if (type === "DECK_CARD_CHARACTER_GROUPING") {
      return { kind: "group", id: r.characterGroupingId, count: Number(r.threshold || 1) };
    }
    throw new Error(`unsupported trigger type ${type}`);
  };

  const target = (id: string): any => {
    const r = targets.get(id);
    if (!r) throw new Error(`unknown effect target ${id}`);
    const type = enumTail(r.type);
    if (type === "ATTRIBUTE") return { kind: "attribute", id: r.cardAttributeType, count: r.targetCount };
    if (type === "CHARACTER_GROUPING") return { kind: "group", id: r.characterGroupingId, count: r.targetCount };
    if (type === "SELF") return { kind: "self" };
    if (type === "ALL") return { kind: "all" };
    throw new Error(`unsupported target type ${type}`);
  };

  const firstEffect = (map: Map<string, any[]>, id: string): any => {
    const r = map.get(id)?.[0]?.data;
    if (!r) throw new Error(`unknown effect group ${id}`);
    return r;
  };
  const passiveKind = (effect: any): string => {
    const kind = PASSIVE_KIND[enumTail(effect.type)];
    if (!kind) throw new Error(`unsupported passive effect type ${enumTail(effect.type)}`);
    return kind;
  };

  const levelCurves: number[][] = [];
  const curveIndex = new Map<string, number>();
  const bloomProfiles: any[][] = [];
  const profileIndex = new Map<string, number>();
  const intern = <V>(list: V[], index: Map<string, number>, value: V): number => {
    const key = JSON.stringify(value);
    let i = index.get(key);
    if (i === undefined) {
      i = list.length;
      list.push(value);
      index.set(key, i);
    }
    return i;
  };

  const convert = (raw: any) => {
    const asset: string = raw.assetId;
    const ch = characters.get(raw.characterId);
    if (!ch) throw new Error(`unknown character ${raw.characterId}`);
    const rarity = Number(/RARITY_(\d)$/.exec(raw.rarity)?.[1]);
    if (!rarity) throw new Error(`unrecognised rarity ${raw.rarity}`);

    const curve = sorted(cardLevel.get(raw.cardLevelGroupId)).map(([, d]) => Number(d.parameterBaseValue));
    if (curve.length === 0) throw new Error(`no level table ${raw.cardLevelGroupId}`);
    const caps = sorted(levelLimit.get(raw.cardLevelLimitGroupId)).map(([, d]) => d.levelLimit);

    // Bloom (potential) profile: cumulative unlocks per upgrade count.
    const stage = { statBonus: 0, activeLevel: 1, passiveLevel: 1, specialLevel: 1, connectLevel: 1 };
    const profile: any[] = [{ stage: 0, ...stage }];
    for (const [n, p] of sorted(potential.get(raw.cardPotentialGroupId))) {
      const type = enumTail(p.effectType);
      const v = Number(p.value);
      if (type === "ACTIVE_SKILL_LEVEL_UP") stage.activeLevel = v;
      else if (type === "PASSIVE_SKILL_LEVEL_UP") stage.passiveLevel = v;
      else if (type === "SPECIAL_SKILL_LEVEL_UP") stage.specialLevel = v;
      else if (type === "SKILL_TREE_CONNECT_EFFECT_LEVEL_UP") stage.connectLevel = v;
      else if (type === "ALL_PARAMETER_UP_PERMIL_UP") stage.statBonus = stage.statBonus + v / 1000;
      else throw new Error(`unsupported potential effect ${type}`);
      profile.push({ stage: n, ...stage });
    }

    const activeLevels: Record<string, any> = {};
    for (const [lv, r] of sorted(activeLv.get(raw.liveActiveSkillId))) {
      const base = firstEffect(activeEffects, r.liveActiveSkillEffectGroupId);
      const d: any = {
        level: lv,
        baseMagnitude: Number(base.value) / 10,
        conditionalMagnitude: null,
        trigger: null,
        duration: (r.effectDurationMillisecond ?? 0) / 1000,
        interval: r.coolTimeMillisecond / 1000,
        probability: r.activationProbabilityPermilMultiply / 1000,
      };
      if (r.additionalLiveActiveSkillEffectGroupId) {
        d.conditionalMagnitude = Number(firstEffect(activeEffects, r.additionalLiveActiveSkillEffectGroupId).value) / 10;
        d.trigger = trigger(r.additionalLiveSkillTriggerGroupId);
      }
      d.text = cleanText(lang.get(r.descriptionLangId));
      const chance = /(High|Medium|Low) Probability/.exec(d.text);
      d.chanceLabel = chance ? CHANCE_LABEL[chance[1]] : null;
      activeLevels[String(lv)] = d;
    }

    const passiveLevels: Record<string, any> = {};
    for (const [lv, r] of sorted(passiveLv.get(raw.livePassiveSkillId))) {
      const e = firstEffect(passiveEffects, r.livePassiveSkillEffectGroupId);
      passiveLevels[String(lv)] = {
        level: lv,
        kind: passiveKind(e),
        pct: Number(e.value) / 1000,
        target: target(e.liveSkillEffectTargetId),
        trigger: trigger(r.liveSkillTriggerGroupId),
        text: cleanText(lang.get(r.descriptionLangId)),
      };
    }

    const specialLevels: Record<string, any> = {};
    for (const [lv, r] of sorted(specialLv.get(raw.liveSpecialSkillId))) {
      const e = firstEffect(activeEffects, r.liveActiveSkillEffectGroupId);
      const d: any = {
        level: lv,
        magnitude: Number(e.value) / 10,
        duration: r.effectDurationMillisecond / 1000,
        sarPct: 0,
        sarTrigger: null,
        unsupported: [] as any[],
        text: cleanText(lang.get(r.descriptionLangId)),
      };
      if (r.additionalLiveActiveSkillEffectGroupId) {
        const e2 = firstEffect(activeEffects, r.additionalLiveActiveSkillEffectGroupId);
        if (enumTail(e2.type) === "LIVE_ACTIVE_SKILL_ACTIVATION_PROBABILITY_UP_PERMIL_UP") {
          d.sarPct = Number(e2.value) / 1000;
          d.sarTrigger = trigger(r.additionalLiveSkillTriggerGroupId);
        } else {
          // Effects the scorer does not model (life recovery, judgement boost);
          // kept so the UI text stays accurate.
          d.unsupported.push({ type: e2.type, value: e2.value ?? null });
        }
      }
      specialLevels[String(lv)] = d;
    }

    for (const [label, levels] of [
      ["active", activeLevels],
      ["passive", passiveLevels],
      ["special", specialLevels],
    ] as [string, Record<string, any>][]) {
      if (!levels["1"] || !levels["2"]) throw new Error(`${label} skill is missing level 1/2 data`);
    }

    const leader = leaders.get(`live_leader_skill-card-${asset}`);
    if (!leader) throw new Error("no leader (outfit) skill");
    const effects: any[] = [];
    for (const [groupId, triggerId] of [
      [leader.livePassiveSkillEffectGroupId, leader.liveSkillTriggerGroupId],
      [leader.additionalLivePassiveSkillEffectGroupId, leader.additionalLiveSkillTriggerGroupId],
    ] as [string | undefined, string | undefined][]) {
      if (!groupId) continue;
      const e = firstEffect(passiveEffects, groupId);
      effects.push({ kind: passiveKind(e), pct: Number(e.value) / 1000, trigger: trigger(triggerId) });
    }

    return {
      id: raw.id,
      assetId: asset,
      characterId: raw.characterId,
      member: ch.nameEng,
      name: lang.get(raw.nameLangId),
      rarity,
      attributeId: raw.attributeType,
      groupIds: groupings.filter((g) => (g.characterIds ?? []).includes(raw.characterId)).map((g) => g.id),
      maxLevel: curve.length,
      statPermil: [raw.performancePermilMultiply, raw.techniquePermilMultiply, raw.sensePermilMultiply],
      levelLimitCaps: caps,
      activeLevels,
      passiveLevels,
      specialLevels,
      outfit: { effects, text: cleanText(lang.get(leader.descriptionLangId)) },
      levelCurve: intern(levelCurves, curveIndex, curve),
      bloomProfile: intern(bloomProfiles, profileIndex, profile),
    };
  };

  const cards: any[] = [];
  const skipped: BuildResult["skipped"] = [];
  const countByRarity: Record<string, number> = {};
  for (const row of t.Card ?? []) {
    const raw = row.data;
    try {
      const card = convert(raw);
      cards.push(card);
      const key = `${card.rarity}★`;
      countByRarity[key] = (countByRarity[key] ?? 0) + 1;
    } catch (err) {
      skipped.push({ assetId: raw?.assetId ?? String(row?.id), reason: (err as Error).message });
    }
  }
  if (cards.length === 0) throw new Error("HolodoriDB master data produced no cards");

  const groupLabels: Record<string, string> = {};
  const groupText = new Map<string, string>((t.LangCharacterGrouping_Eng ?? []).map((r) => [r.id, r.data.text]));
  for (const g of groupings) groupLabels[g.id] = groupText.get(g.nameLangId) ?? g.id;

  return {
    packed: {
      schemaVersion: 2,
      source: "HolodoriDB/holodori-db-eng-diff",
      sourceVersion: version,
      groupLabels,
      attributeLabels: ATTRIBUTE_LABELS,
      counts: countByRarity,
      cards,
      levelCurves,
      bloomProfiles,
    },
    skipped,
  };
}
