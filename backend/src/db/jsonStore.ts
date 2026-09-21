import fs from "node:fs";
import config from "../config.js";
import { logger } from "../logger.js";

// Dev-mode JSON-file data store. Shares the same conceptual shape as the
// Postgres tables (characters, presets, roster, guides, songs) so the services
// can treat it as a drop-in when DATABASE_URL is not set.

export interface CharacterRow {
  id: string;
  name: string;
  title: string;
  rarity: string;
  rarityNum?: number;
  attribute?: string;
  fallbackImage?: string;
  group: string;
  type: string;
  accentColor: string;
  image: string;
  avatar: string;
  stats: any;
  skills: any;
  cardData?: any;
  cards?: any[];
  characterId?: string | null;
  attributeId?: string | null;
  groupIds?: string[];
  assetId?: string | null;
}

export interface JsonDB {
  characters: CharacterRow[];
  presets: Record<string, any[]>;
  roster: Record<string, string[]>;
  guides: any[];
  songs: any[];
  [key: string]: any;
}

const emptyDB = (): JsonDB => ({
  characters: [],
  presets: {},
  roster: {},
  guides: [],
  songs: [],
});

// Per-device data (presets, rosters) lives in a sibling "<name>.user.json" file
// that is gitignored. database.json only carries the shared catalog (characters,
// guides, songs) so the repository never contains anyone's saved teams.
export const userDataPath = (): string => config.dbPath.replace(/\.json$/i, "") + ".user.json";

const readJson = (file: string): any => JSON.parse(fs.readFileSync(file, "utf8"));

const atomicWrite = (file: string, data: unknown): void => {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
};

export const loadDB = (): JsonDB => {
  if (!fs.existsSync(config.dbPath)) {
    return emptyDB();
  }
  try {
    const parsed = readJson(config.dbPath) as JsonDB;
    // Legacy databases still carry presets/roster inline: honour them as a
    // fallback, the user file wins once it exists.
    if (Array.isArray(parsed.presets) || !parsed.presets) parsed.presets = {};
    if (Array.isArray(parsed.roster) || !parsed.roster) parsed.roster = {};
    const userFile = userDataPath();
    if (fs.existsSync(userFile)) {
      try {
        const user = readJson(userFile);
        parsed.presets = { ...parsed.presets, ...(user.presets || {}) };
        parsed.roster = { ...parsed.roster, ...(user.roster || {}) };
      } catch (err) {
        logger.error({ err }, "Error reading user data file; ignoring it");
      }
    }
    if (!parsed.guides) parsed.guides = [];
    if (!parsed.songs) parsed.songs = [];
    return parsed;
  } catch (err) {
    logger.error({ err }, "Error reading database.json");
    return emptyDB();
  }
};

export const saveDB = (data: JsonDB): void => {
  try {
    const { presets, roster, ...catalog } = data;
    atomicWrite(userDataPath(), { presets: presets || {}, roster: roster || {} });
    atomicWrite(config.dbPath, { ...catalog, presets: {}, roster: {} });
  } catch (err) {
    logger.error({ err }, "Error writing database.json");
  }
};
