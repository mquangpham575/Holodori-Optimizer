import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import type { Request, Response } from "express";
import config from "../config.js";
import { upsertCardArtPG } from "../db/postgres.js";
import {
  syncFromFile,
  bulkCreateCharacters,
  createCharacter,
  updateCharacterById,
  deleteCharacterById,
} from "../services/characterService.js";
import {
  createGuide,
  updateGuideById,
  deleteGuideById,
} from "../services/guideService.js";

const ALLOWED_IMAGE_EXT = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Cheap content sniffing so a renamed .html/.svg can never be stored under an
// image extension and served from our origin (stored XSS).
const looksLikeImage = (b: Buffer): boolean =>
  (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") ||
  (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") ||
  (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8");

export const upload = (req: Request, res: Response): void => {
  const { fileName, base64Data } = req.body as { fileName?: string; base64Data?: string };
  if (!fileName || !base64Data) {
    res.status(400).json({ error: "Filename and base64Data are required" });
    return;
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const ext = (path.extname(fileName) || ".webp").toLowerCase();
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      res.status(400).json({ error: "Only .webp, .png, .jpg and .gif images can be uploaded" });
      return;
    }
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "Image must be between 1 byte and 10 MB" });
      return;
    }
    if (!looksLikeImage(buffer)) {
      res.status(400).json({ error: "File content is not a valid image" });
      return;
    }
    const safeName = `upload_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;

    if (!fs.existsSync(config.imagesDir)) {
      fs.mkdirSync(config.imagesDir, { recursive: true });
    }

    const targetPath = path.join(config.imagesDir, safeName);
    fs.writeFileSync(targetPath, buffer);

    res.json({ success: true, url: `/images/${safeName}` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// Manually supply artwork for a card the automatic sync has no image for.
// Stored where the automatic sync stores it (Postgres in prod, the cards image
// folder in dev) so both paths serve it from the same URL.
export const cardArtUpload = async (req: Request, res: Response): Promise<void> => {
  const { assetId, base64Data } = res.locals.validated ?? req.body;
  const buffer = Buffer.from(String(base64Data).replace(/^data:image\/\w+;base64,/, ""), "base64");
  const isWebp = buffer.length > 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP";
  if (!isWebp || buffer.length > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: "Card art must be a WebP image up to 10 MB" });
    return;
  }
  if (config.isProd) {
    await upsertCardArtPG([{ assetId, data: buffer }]);
  } else {
    const dir = path.join(config.imagesDir, "cards");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${assetId}.webp`), buffer);
  }
  res.json({ success: true, url: `/images/cards/${assetId}.webp` });
};

export const syncFromFileAdmin = async (_req: Request, res: Response): Promise<void> => {
  const characters = await syncFromFile();
  res.json({ success: true, characters });
};

export const charactersBulk = async (req: Request, res: Response): Promise<void> => {
  const list = res.locals.validated ?? req.body;
  const count = await bulkCreateCharacters(list);
  res.json({ success: true, count });
};

export const charactersCreate = async (req: Request, res: Response): Promise<void> => {
  const char = res.locals.validated ?? req.body;
  await createCharacter(char);
  res.status(201).json({ success: true, character: char });
};

export const charactersUpdate = async (req: Request, res: Response): Promise<void> => {
  const patch = res.locals.validated ?? req.body;
  await updateCharacterById(String(req.params.id), patch);
  res.json({ success: true, character: patch });
};

export const charactersDelete = async (req: Request, res: Response): Promise<void> => {
  await deleteCharacterById(String(req.params.id));
  res.json({ success: true });
};

export const guidesCreate = async (req: Request, res: Response): Promise<void> => {
  const guide = res.locals.validated ?? req.body;
  await createGuide(guide);
  res.status(201).json({ success: true, guide });
};

export const guidesUpdate = async (req: Request, res: Response): Promise<void> => {
  const patch = res.locals.validated ?? req.body;
  await updateGuideById(String(req.params.id), patch);
  res.json({ success: true, guide: patch });
};

export const guidesDelete = async (req: Request, res: Response): Promise<void> => {
  await deleteGuideById(String(req.params.id));
  res.json({ success: true });
};
