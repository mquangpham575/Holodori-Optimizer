import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB, saveDB, type CharacterRow } from "../db/jsonStore.js";
import { logger } from "../logger.js";

const CHAR_INSERT = `(id, name, title, rarity, "group", type, accentColor, image, avatar, stats, skills, "cardData", "cards", "characterId", "attributeId", "groupIds", "assetId")`;

const charParams = (char: CharacterRow): any[] => [
  char.id,
  char.name,
  char.title,
  char.rarity,
  char.group,
  char.type,
  char.accentColor,
  char.image,
  char.avatar,
  JSON.stringify(char.stats),
  JSON.stringify(char.skills),
  JSON.stringify(char.cardData || {}),
  JSON.stringify(char.cards || []),
  char.characterId || null,
  char.attributeId || null,
  JSON.stringify(char.groupIds || []),
  char.assetId || null,
];

const TYPE_LABELS: Record<string, string> = { CUTE: "Cute", PURE: "Pure", HAPPY: "Happy" };

// The JSON dev store keeps a few presentation fields that have no Postgres
// column; derive them here so both stores return the same character shape.
export const mapCharacterRow = (row: any): CharacterRow => ({
  id: row.id,
  name: row.name,
  title: row.title,
  rarity: row.rarity,
  rarityNum: Number.parseInt(String(row.rarity), 10) || undefined,
  attribute: TYPE_LABELS[String(row.type)] ?? undefined,
  fallbackImage: `/images/${row.id}.webp`,
  group: row.group,
  type: row.type,
  accentColor: row.accentcolor !== undefined ? row.accentcolor : row.accentColor,
  image: row.assetId ? `/images/cards/${row.assetId}.webp` : row.image,
  avatar: row.avatar,
  stats: row.stats,
  skills: row.skills,
  cardData: row.cardData,
  cards: row.cards,
  characterId: row.characterId,
  attributeId: row.attributeId,
  groupIds: row.groupIds,
  assetId: row.assetId,
});

export const listCharacters = async (): Promise<CharacterRow[]> => {
  if (config.isProd) {
    const res = await getPool().query("SELECT * FROM characters");
    return res.rows.map(mapCharacterRow);
  }
  return loadDB().characters || [];
};

export const insertCharacter = async (char: CharacterRow): Promise<void> => {
  if (config.isProd) {
    await getPool().query(
      `INSERT INTO characters ${CHAR_INSERT} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)`,
      charParams(char)
    );
    return;
  }
  const db = loadDB();
  if (db.characters.some((c) => c.id === char.id)) {
    const err = new Error("Character ID already exists") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  db.characters.push(char);
  saveDB(db);
};

export const updateCharacter = async (charId: string, char: Partial<CharacterRow>): Promise<void> => {
  if (config.isProd) {
    // Partial update: the JSON store merges, so Postgres must too. Binding
    // `undefined` used to NULL every omitted NOT NULL column (500) or wipe stats.
    const sets: string[] = [];
    const values: any[] = [];
    const add = (col: string, val: any, cast = "") => {
      values.push(val);
      sets.push(`${col} = $${values.length}${cast}`);
    };
    const plain: [string, keyof CharacterRow][] = [
      ["name", "name"],
      ["title", "title"],
      ["rarity", "rarity"],
      ['"group"', "group"],
      ["type", "type"],
      ["accentColor", "accentColor"],
      ["image", "image"],
      ["avatar", "avatar"],
    ];
    for (const [col, key] of plain) if (char[key] !== undefined) add(col, char[key]);
    if (char.stats !== undefined) add("stats", JSON.stringify(char.stats), "::jsonb");
    if (char.skills !== undefined) add("skills", JSON.stringify(char.skills), "::jsonb");
    if (char.cardData !== undefined) add('"cardData"', JSON.stringify(char.cardData), "::jsonb");
    if (char.cards !== undefined) add('"cards"', JSON.stringify(char.cards), "::jsonb");
    if (char.characterId !== undefined) add('"characterId"', char.characterId);
    if (char.attributeId !== undefined) add('"attributeId"', char.attributeId);
    if (char.groupIds !== undefined) add('"groupIds"', JSON.stringify(char.groupIds), "::jsonb");
    if (char.assetId !== undefined) add('"assetId"', char.assetId);
    values.push(charId);
    const result = sets.length
      ? await getPool().query(`UPDATE characters SET ${sets.join(", ")} WHERE id = $${values.length}`, values)
      : await getPool().query("SELECT 1 FROM characters WHERE id = $1", [charId]);
    if (result.rowCount === 0) {
      const err = new Error("Character not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return;
  }
  const db = loadDB();
  const idx = db.characters.findIndex((c) => c.id === charId);
  if (idx === -1) {
    const err = new Error("Character not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  db.characters[idx] = { ...db.characters[idx], ...char, id: charId };
  saveDB(db);
};

export const deleteCharacter = async (charId: string): Promise<void> => {
  if (config.isProd) {
    const result = await getPool().query("DELETE FROM characters WHERE id = $1", [charId]);
    if (result.rowCount === 0) {
      const err = new Error("Character not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return;
  }
  const db = loadDB();
  const idx = db.characters.findIndex((c) => c.id === charId);
  if (idx === -1) {
    const err = new Error("Character not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  db.characters.splice(idx, 1);
  saveDB(db);
};

export const bulkReplaceCharacters = async (characters: CharacterRow[]): Promise<void> => {
  if (config.isProd) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM characters");
      for (const char of characters) {
        await client.query(
          `INSERT INTO characters ${CHAR_INSERT} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)`,
          charParams(char)
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return;
  }
  const db = loadDB();
  db.characters = characters;
  saveDB(db);
};

// Insert or full-field update of a single character row within an existing
// transaction (used by the admin "sync from file" flow).
export const upsertCharacterInTx = async (client: any, char: CharacterRow): Promise<void> => {
  const existing = await client.query("SELECT * FROM characters WHERE id = $1", [char.id]);
  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO characters ${CHAR_INSERT} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17)`,
      charParams(char)
    );
    return;
  }
  const fieldsToUpdate: string[] = [];
  const values: any[] = [];
  let valIdx = 1;
  const set = (sql: string, val: any) => {
    fieldsToUpdate.push(sql.replace("$", `$${valIdx++}`));
    values.push(val);
  };
  set("name = $", char.name);
  set("title = $", char.title);
  set("rarity = $", char.rarity);
  set('"group" = $', char.group);
  set("type = $", char.type);
  set("accentColor = $", char.accentColor);
  set("image = $", char.image);
  set("avatar = $", char.avatar);
  set("stats = $::jsonb", JSON.stringify(char.stats));
  set("skills = $::jsonb", JSON.stringify(char.skills));
  set('"cardData" = $::jsonb', JSON.stringify(char.cardData || {}));
  set('"cards" = $::jsonb', JSON.stringify(char.cards || []));
  set('"characterId" = $', char.characterId || null);
  set('"attributeId" = $', char.attributeId || null);
  set('"groupIds" = $::jsonb', JSON.stringify(char.groupIds || []));
  set('"assetId" = $', char.assetId || null);
  if (fieldsToUpdate.length > 0) {
    values.push(char.id);
    await client.query(
      `UPDATE characters SET ${fieldsToUpdate.join(", ")} WHERE id = $${valIdx}`,
      values
    );
  }
};

export const pruneDuplicateCharacters = async (
  client: any,
  activeCharacterIds: string[],
  activeMemberIds: string[]
): Promise<void> => {
  if (!activeCharacterIds.length || !activeMemberIds.length) return;
  const pruneRes = await client.query(
    `DELETE FROM characters
     WHERE NOT (id = ANY($1)) AND "characterId" = ANY($2)`,
    [activeCharacterIds, activeMemberIds]
  );
  if (pruneRes.rowCount > 0) {
    logger.info(`Pruned ${pruneRes.rowCount} duplicate character rows.`);
  }
};
