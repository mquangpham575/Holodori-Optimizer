import type { Request, Response } from "express";
import { getRoster, saveRoster } from "../services/rosterService.js";

const getDeviceId = (req: Request): string => (req.headers["x-device-id"] as string) || "default_device";

export const get = async (req: Request, res: Response): Promise<void> => {
  res.json(await getRoster(getDeviceId(req)));
};

export const put = async (req: Request, res: Response): Promise<void> => {
  const ownedIds = res.locals.validated ?? req.body;
  await saveRoster(getDeviceId(req), ownedIds);
  res.json({ success: true });
};
