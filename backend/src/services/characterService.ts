import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB, saveDB } from "../db/jsonStore.js";
import { loadFrontendData } from "./dataLoader.js";
import { syncHolodoriCards } from "./syncService.js";
import { createTTLCache } from "../repositories/searchIndexRepository.js";
import type { CharacterRow } from "../db/jsonStore.js";
import {
  listCharacters as repoList,
  bulkReplaceCharacters,
  insertCharacter,
  updateCharacter,
  deleteCharacter,
  upsertCharacterInTx,
  pruneDuplicateCharacters,
  mapCharacterRow,
} from "../repositories/characterRepository.js";

const charactersCache = createTTLCache<CharacterRow[]>(30000);

export const listCharacters = async (): Promise<CharacterRow[]> => {
  const cached = charactersCache.get("all");
  if (cached) return cached;

  const result = await repoList();
  charactersCache.set("all", result);
  return result;
};

const invalidateCharactersCache = (): void => {
  charactersCache.delete("all");
};

export const syncFromFile = async (): Promise<CharacterRow[]> => {
  const module = await loadFrontendData();
  const charactersToSync: CharacterRow[] = module.CHARACTERS;

  if (config.isProd) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (const char of charactersToSync) {
        await upsertCharacterInTx(client, char);
      }

      const srcCharacterIds = charactersToSync.map((c) => c.id);
      const srcMemberIds = charactersToSync
        .map((c) => c.characterId)
        .filter((id): id is string => Boolean(id));
      await pruneDuplicateCharacters(client, srcCharacterIds, srcMemberIds);

      await client.query("COMMIT");

      // data.js is a static snapshot that can lag behind upstream; force the
      // HolodoriDB enrichment so a file sync never downgrades live card data.
      await client.query(`DELETE FROM app_meta WHERE key = 'holodori_packed_hash'`);
      await syncHolodoriCards();

      const updatedList = await getPool().query("SELECT * FROM characters");
      invalidateCharactersCache();
      return updatedList.rows.map(mapCharacterRow);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const db = loadDB();
  if (!db.characters) db.characters = [];
  for (const char of charactersToSync) {
    const existingIdx = db.characters.findIndex((c) => c.id === char.id);
    if (existingIdx === -1) {
      db.characters.push(char);
    } else {
      db.characters[existingIdx] = { ...db.characters[existingIdx], ...char };
    }
  }
  // data.js is a static snapshot that can lag behind upstream; force the
  // HolodoriDB enrichment so a file sync never downgrades live card data.
  delete db.holodoriPackedHash;
  saveDB(db);
  await syncHolodoriCards();
  invalidateCharactersCache();
  return loadDB().characters;
};

export const bulkCreateCharacters = async (charactersList: CharacterRow[]): Promise<number> => {
  await bulkReplaceCharacters(charactersList);
  invalidateCharactersCache();
  return charactersList.length;
};

export const createCharacter = async (char: CharacterRow): Promise<void> => {
  await insertCharacter(char);
  invalidateCharactersCache();
};

export const updateCharacterById = async (charId: string, char: Partial<CharacterRow>): Promise<void> => {
  await updateCharacter(charId, char);
  invalidateCharactersCache();
};

export const deleteCharacterById = async (charId: string): Promise<void> => {
  await deleteCharacter(charId);
  invalidateCharactersCache();
};
