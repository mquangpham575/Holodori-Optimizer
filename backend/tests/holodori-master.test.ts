import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPackedFromMaster } from "../src/etl/holodori-master.ts";

// The fixture is a real subset of the HolodoriDB master tables plus the
// normalized cards the previous (optimizer-bundled) source produced for the
// same cards. It covers every skill shape seen in the game: combo/life/attribute/
// group triggers, self/attribute/group passive targets, SAR specials, unsupported
// special effects, two-effect outfit skills, and 3/4/5-star curves.
const fx = JSON.parse(readFileSync("backend/tests/fixtures/holodori-master-fixture.json", "utf8"));

const resolve = (packed: any, c: any) => ({
  ...c,
  levelCurve: packed.levelCurves[c.levelCurve],
  bloomProfile: packed.bloomProfiles[c.bloomProfile],
});

test("master-data converter reproduces the reference cards field-for-field", () => {
  const { packed, skipped } = buildPackedFromMaster(fx.version, fx.tables);
  assert.deepEqual(skipped, []);
  for (const expected of fx.expected) {
    const got = packed.cards.find((c: any) => c.assetId === expected.assetId);
    assert.ok(got, `card ${expected.assetId} was built`);
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(resolve(packed, got))),
      JSON.parse(JSON.stringify(expected)),
      `card ${expected.assetId}`
    );
  }
  assert.deepEqual(packed.groupLabels, fx.groupLabels);
  assert.deepEqual(packed.attributeLabels, fx.attributeLabels);
  assert.equal(packed.sourceVersion, fx.version);
});

test("cards that only exist in master data (not in the old pack) convert too", () => {
  const { packed } = buildPackedFromMaster(fx.version, fx.tables);
  const card = packed.cards.find((c: any) => c.assetId === "00004-5-uniq-0081-00");
  assert.ok(card, "new card is present");
  assert.equal(card.member, "Aki Rosenthal");
  assert.equal(card.name, "Mystic Sun Swing");
  assert.equal(card.rarity, 5);
  assert.deepEqual(Object.keys(card.activeLevels), ["1", "2"]);
  assert.ok(card.activeLevels["2"].baseMagnitude > card.activeLevels["1"].baseMagnitude);
  assert.ok(card.specialLevels["1"].text.length > 0 && !/\[\/?[a-z]/.test(card.specialLevels["1"].text), "markup stripped");
});

test("one unconvertible card is skipped without losing the rest", () => {
  const tables = JSON.parse(JSON.stringify(fx.tables));
  tables.Card[0].data.liveActiveSkillId = "does-not-exist";
  const { packed, skipped } = buildPackedFromMaster(fx.version, tables);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].assetId, tables.Card[0].data.assetId);
  assert.equal(packed.cards.length, tables.Card.length - 1);
});

test("enrichment gives 3/4-star cards real max stats (curves shorter than 80 levels)", async () => {
  const { packedToLegacySnapshot, enrichCharacters } = await import("../src/etl/holodori-sync.ts");
  const { packed } = buildPackedFromMaster(fx.version, fx.tables);
  const snapshot = packedToLegacySnapshot(packed);
  const base = [
    { id: "akirosenthal", name: "Aki Rosenthal", title: "", type: "HAPPY", image: "", skills: {}, cardData: {} },
    { id: "robocosan", name: "Robocosan", title: "", type: "HAPPY", image: "", skills: {}, cardData: {} },
    { id: "oozorasubaru", name: "Oozora Subaru", title: "", type: "HAPPY", image: "", skills: {}, cardData: {} },
  ];
  const { characters, skipped } = enrichCharacters(base, snapshot);
  assert.deepEqual(skipped, []);
  const find = (name: string, rarity: number) =>
    characters.find((c: any) => c.name === name).cards.find((c: any) => c.rarity === rarity);

  // Unchanged 5-star path (regression guard for the historical numbers).
  assert.deepEqual(find("Aki Rosenthal", 5).stats, { performance: 7828, technique: 11145, sense: 6947, total: 25920 });

  // 4-star curves have 70 levels and 3-star 60: max stats used to come out null.
  for (const [name, rarity] of [["Robocosan", 4], ["Oozora Subaru", 3]] as [string, number][]) {
    const card = find(name, rarity);
    assert.ok(card, `${name} ${rarity}-star exists`);
    for (const v of Object.values(card.stats)) assert.ok(Number.isFinite(v) && (v as number) > 0, `${name} stat ${v}`);
    for (const b of card.bloomStats) assert.ok(Number.isFinite(b.total) && b.total > 0, `${name} bloom ${b.stage}`);
  }
});
