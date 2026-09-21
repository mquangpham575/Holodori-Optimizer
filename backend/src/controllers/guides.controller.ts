import type { Request, Response } from "express";
import { listGuides } from "../services/guideService.js";

export const list = async (_req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "public, max-age=30");
  res.json(await listGuides());
};
