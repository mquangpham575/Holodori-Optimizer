import path from "node:path";
import fs from "node:fs";
import type { Request, Response } from "express";
import config from "../config.js";
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

export const upload = (req: Request, res: Response): void => {
  const { fileName, base64Data } = req.body as { fileName?: string; base64Data?: string };
  if (!fileName || !base64Data) {
    res.status(400).json({ error: "Filename and base64Data are required" });
    return;
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const ext = path.extname(fileName) || ".webp";
    const safeName = `upload_${Date.now()}${ext}`;

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

export const syncFromFileAdmin = async (req: Request, res: Response): Promise<void> => {
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
  await updateCharacterById(String(req.params.id), req.body);
  res.json({ success: true, character: req.body });
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
  await updateGuideById(String(req.params.id), req.body);
  res.json({ success: true, guide: req.body });
};

export const guidesDelete = async (req: Request, res: Response): Promise<void> => {
  await deleteGuideById(String(req.params.id));
  res.json({ success: true });
};
