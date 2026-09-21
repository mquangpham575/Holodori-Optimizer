import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { loadDB, saveDB } from "../db/jsonStore.js";

export interface Guide {
  id: string;
  title: any;
  summary: any;
  category: string;
  readTime: string;
  author: string;
  date: string;
  content: string;
  contentUrl?: any;
}

export const parseGuidesRows = (rows: any[]): Guide[] =>
  rows.map((row) => {
    let title = row.title;
    let summary = row.summary;
    let contentUrl = row.contenturl || row.contentUrl;

    try {
      if (typeof title === "string" && (title.startsWith("{") || title.startsWith("["))) {
        title = JSON.parse(title);
      }
    } catch {}
    try {
      if (typeof summary === "string" && (summary.startsWith("{") || summary.startsWith("["))) {
        summary = JSON.parse(summary);
      }
    } catch {}
    try {
      if (typeof contentUrl === "string" && (contentUrl.startsWith("{") || contentUrl.startsWith("["))) {
        contentUrl = JSON.parse(contentUrl);
      }
    } catch {}

    // origin/seedhash are seed bookkeeping, not part of the public guide shape.
    // Postgres folds unquoted column names to lower case, so `readTime` comes back
    // as `readtime` and the UI (which reads `readTime`) rendered it blank in prod.
    const { origin: _origin, seedhash: _seedhash, contenturl: _contenturl, readtime, ...rest } = row;
    return { ...rest, readTime: row.readTime ?? readtime, title, summary, contentUrl };
  });

export const listGuides = async (): Promise<Guide[]> => {
  if (config.isProd) {
    const res = await getPool().query("SELECT * FROM guides ORDER BY id ASC");
    return parseGuidesRows(res.rows);
  }
  return loadDB().guides || [];
};

const asText = (v: any): string => (typeof v === "string" ? v : JSON.stringify(v ?? ""));

export const insertGuide = async (guide: Guide): Promise<void> => {
  if (config.isProd) {
    await getPool().query(
      `INSERT INTO guides (id, title, summary, category, readTime, author, date, content, contentUrl, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'admin')`,
      [
        guide.id,
        asText(guide.title),
        asText(guide.summary),
        guide.category ?? "",
        guide.readTime ?? "",
        guide.author ?? "",
        guide.date ?? "",
        guide.content ?? "",
        guide.contentUrl ? JSON.stringify(guide.contentUrl) : null,
      ]
    );
    return;
  }
  const db = loadDB();
  if (db.guides.some((g) => g.id === guide.id)) {
    const err = new Error("Guide ID already exists") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  db.guides.push(guide);
  saveDB(db);
};

export const updateGuide = async (guideId: string, guide: Partial<Guide>): Promise<void> => {
  if (config.isProd) {
    // Partial update: only touch the columns actually supplied. Binding
    // `undefined` here used to write NULL into NOT NULL columns (500) or wipe data.
    const sets: string[] = [];
    const values: any[] = [];
    const add = (col: string, val: any, cast = "") => {
      values.push(val);
      sets.push(`${col} = $${values.length}${cast}`);
    };
    if (guide.title !== undefined) add("title", asText(guide.title));
    if (guide.summary !== undefined) add("summary", asText(guide.summary));
    if (guide.category !== undefined) add("category", guide.category);
    if (guide.readTime !== undefined) add("readTime", guide.readTime);
    if (guide.author !== undefined) add("author", guide.author);
    if (guide.date !== undefined) add("date", guide.date);
    if (guide.content !== undefined) add("content", guide.content);
    if (guide.contentUrl !== undefined) {
      add("contentUrl", guide.contentUrl ? JSON.stringify(guide.contentUrl) : null, "::jsonb");
    }
    // Any admin edit takes the guide out of the seed's reach.
    sets.push("origin = 'admin'");
    values.push(guideId);
    const result = sets.length
      ? await getPool().query(`UPDATE guides SET ${sets.join(", ")} WHERE id = $${values.length}`, values)
      : await getPool().query("SELECT 1 FROM guides WHERE id = $1", [guideId]);
    if (result.rowCount === 0) {
      const err = new Error("Guide not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return;
  }
  const db = loadDB();
  const idx = db.guides.findIndex((g) => g.id === guideId);
  if (idx === -1) {
    const err = new Error("Guide not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  db.guides[idx] = { ...db.guides[idx], ...guide, id: guideId };
  saveDB(db);
};

export const deleteGuide = async (guideId: string): Promise<void> => {
  if (config.isProd) {
    const result = await getPool().query("DELETE FROM guides WHERE id = $1", [guideId]);
    if (result.rowCount === 0) {
      const err = new Error("Guide not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    // Remember the deletion so the boot-time seed does not resurrect a bundled guide.
    await getPool().query(
      `INSERT INTO app_meta (key, value) VALUES ($1, '1') ON CONFLICT (key) DO NOTHING`,
      [`guide_deleted:${guideId}`]
    );
    return;
  }
  const db = loadDB();
  const idx = db.guides.findIndex((g) => g.id === guideId);
  if (idx === -1) {
    const err = new Error("Guide not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  db.guides.splice(idx, 1);
  saveDB(db);
};
