import type { Request, Response } from "express";
import { getPresets, savePresets } from "../services/presetService.js";

const getDeviceId = (req: Request): string => (req.headers["x-device-id"] as string) || "default_device";

export const get = async (req: Request, res: Response): Promise<void> => {
  res.json(await getPresets(getDeviceId(req)));
};

export const put = async (req: Request, res: Response): Promise<void> => {
  const presets = res.locals.validated ?? req.body;
  await savePresets(getDeviceId(req), presets);
  res.json({ success: true });
};
