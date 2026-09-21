import type { Request, Response } from "express";
import { listCharacters } from "../services/characterService.js";
import { searchCharacters } from "../repositories/searchIndexRepository.js";

export const list = async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "public, max-age=30");
  res.json(await listCharacters());
};

export const search = async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "public, max-age=30");
  res.json(await searchCharacters(String(req.query.q || "")));
};
