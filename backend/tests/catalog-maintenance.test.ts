import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fx = JSON.parse(readFileSync("backend/tests/fixtures/holodori-master-fixture.json", "utf8"));

// config.ts reads DB_PATH once when it is first imported, and most of the modules
// under test import it. So the temp path must exist before any of them is loaded
// (hence dynamic imports below rather than static ones).
const tempDir = mkdtempSync(join(tmpdir(), "holodreams-catalog-"));
process.env.DB_PATH = join(tempDir, "database.json");
after(() => rmSync(tempDir, { recursive: true, force: true }));

const snapshotFromFixture = async () => {
  const { buildPackedFromMaster } = await import("../src/etl/holodori-master.ts");
  const { packedToLegacySnapshot } = await import("../src/etl/holodori-sync.ts");
  return packedToLegacySnapshot(buildPackedFromMaster(fx.version, fx.tables).packed);
};

test("new upstream members are detected and get a complete, enrichable row", async () => {
  const { buildSkeletonFromSnapshot, findNewMembers } = await import("../src/services/syncService.ts");
  const { enrichCharacters } = await import("../src/etl/holodori-sync.ts");
  const snapshot = await snapshotFromFixture();

  const all = buildSkeletonFromSnapshot(snapshot);
  assert.ok(all.length >= 2, "fixture covers several members");
  assert.deepEqual(findNewMembers(all, snapshot), [], "nothing is new when every member already has a row");

  const [dropped, ...known] = all;
  const added = findNewMembers(known, snapshot);
  assert.equal(added.length, 1);
  const row = added[0];
  assert.equal(row.name, dropped.name);
  assert.match(row.id, /^[a-z0-9]+$/, "id follows the existing lower-case, punctuation-free convention");
  assert.equal(row.rarity, "5-Star");
  assert.ok(["CUTE", "PURE", "HAPPY"].includes(row.type));
  assert.ok(row.group, "group label resolved from the group id");
  assert.match(row.accentColor, /^#[0-9a-f]{6}$/i);
  assert.equal(row.avatar, row.name[0].toUpperCase());

  // Matching is by characterId first, so a renamed row is not duplicated.
  const renamed = known.map((k, i) => (i === 0 ? { ...k, name: "Renamed Upstream" } : k));
  assert.equal(findNewMembers(renamed, snapshot).length, 1);

  const { characters } = enrichCharacters([row], snapshot);
  assert.equal(characters.length, 1);
  assert.ok(characters[0].cards.length > 0, "cards attached");
  assert.ok(Number.isFinite(characters[0].stats.total) && characters[0].stats.total > 0);
});

test("umbrella groups do not win over the member's specific group", async () => {
  const { buildSkeletonFromSnapshot } = await import("../src/services/syncService.ts");
  const snapshot = await snapshotFromFixture();
  const card = snapshot.cards[0];
  const patched = {
    ...snapshot,
    groupLabels: { ...snapshot.groupLabels, "grp-indonesia": "Indonesia", "grp-indonesia-gen_1": "ID Gen 1" },
    cards: [{ ...card, groupIds: ["grp-indonesia", "grp-indonesia-gen_1"] }],
  };
  assert.equal(buildSkeletonFromSnapshot(patched)[0].group, "ID Gen 1");
});

test("Postgres guide rows come back in the shape the UI reads", async () => {
  const { parseGuidesRows } = await import("../src/repositories/guideRepository.ts");
  const [g] = parseGuidesRows([
    {
      id: "g1",
      title: '{"en":"Hello"}',
      summary: "plain",
      category: "General",
      readtime: "5 min read",
      author: "a",
      date: "2026-01-01",
      content: "x",
      contenturl: '{"en":"/blog/x.md"}',
      origin: "seed",
      seedhash: "abc",
    },
  ]);
  assert.equal(g.readTime, "5 min read");
  assert.deepEqual(g.title, { en: "Hello" });
  assert.deepEqual(g.contentUrl, { en: "/blog/x.md" });
  for (const internal of ["origin", "seedhash", "readtime", "contenturl"]) {
    assert.ok(!(internal in g), `${internal} is not exposed`);
  }
});

test("per-device presets/rosters are stored outside database.json", async () => {
  const { loadDB, saveDB, userDataPath } = await import("../src/db/jsonStore.ts");
  const dbPath = process.env.DB_PATH!;
  const db = loadDB();
  db.presets = { dev1: [{ id: "preset_1" }] };
  db.roster = { dev1: ["azki"] };
  saveDB(db);

  const main = JSON.parse(readFileSync(dbPath, "utf8"));
  assert.deepEqual(main.presets, {});
  assert.deepEqual(main.roster, {});
  assert.ok(existsSync(userDataPath()));

  const again = loadDB();
  assert.deepEqual(again.presets, { dev1: [{ id: "preset_1" }] });
  assert.deepEqual(again.roster, { dev1: ["azki"] });
});
