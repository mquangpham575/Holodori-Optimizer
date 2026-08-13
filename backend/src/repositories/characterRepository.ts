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

export const mapCharacterRow = (row: any): CharacterRow => ({
  id: row.id,
  name: row.name,
  title: row.title,
  rarity: row.rarity,
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
    const result = await getPool().query(
      `UPDATE characters
       SET name = $1, title = $2, rarity = $3, "group" = $4, type = $5, accentColor = $6, image = $7, avatar = $8, stats = $9::jsonb, skills = $10::jsonb
       WHERE id = $11`,
      [
        char.name,
        char.title,
        char.rarity,
        char.group,
        char.type,
        char.accentColor,
        char.image,
        char.avatar,
        JSON.stringify(char.stats || {}),
        JSON.stringify(char.skills || {}),
        charId,
      ]
    );
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
