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

    return { ...row, title, summary, contentUrl };
  });

export const listGuides = async (): Promise<Guide[]> => {
  if (config.isProd) {
    const res = await getPool().query("SELECT * FROM guides ORDER BY id ASC");
    return parseGuidesRows(res.rows);
  }
  return loadDB().guides || [];
};

export const insertGuide = async (guide: Guide): Promise<void> => {
  if (config.isProd) {
    await getPool().query(
      `INSERT INTO guides (id, title, summary, category, readTime, author, date, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [guide.id, guide.title, guide.summary, guide.category, guide.readTime, guide.author, guide.date, guide.content]
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
    const result = await getPool().query(
      `UPDATE guides
       SET title = $1, summary = $2, category = $3, readTime = $4, author = $5, date = $6, content = $7
       WHERE id = $8`,
      [
        guide.title,
        guide.summary,
        guide.category,
        guide.readTime,
        guide.author,
        guide.date,
        guide.content,
        guideId,
      ]
    );
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
