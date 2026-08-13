import { pathToFileURL } from "node:url";
import config from "../config.js";

// Loads the frontend's static snapshot (src/data.js) as a fallback seed source.
// Resolved by absolute path so it works regardless of the module's own depth
// and inside the backend container (where frontend/src may be absent — the
// callers only use this when the JSON store has no data yet).
export const loadFrontendData = async (): Promise<any> => {
  return await import(pathToFileURL(config.dataJsPath).href);
};
