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

export const loadDB = (): JsonDB => {
  if (!fs.existsSync(config.dbPath)) {
    return emptyDB();
  }
  try {
    const raw = fs.readFileSync(config.dbPath, "utf8");
    const parsed = JSON.parse(raw) as JsonDB;
    if (Array.isArray(parsed.presets)) parsed.presets = {};
    if (Array.isArray(parsed.roster)) parsed.roster = {};
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
    const tmp = `${config.dbPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, config.dbPath);
  } catch (err) {
    logger.error({ err }, "Error writing database.json");
  }
};
