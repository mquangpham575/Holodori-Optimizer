import type { Request, Response } from "express";
import config from "../config.js";
import { verifyPassword, signToken } from "../services/authService.js";
import { loginSchema } from "../schemas/index.js";

export const login = (req: Request, res: Response): void => {
  const parsed = loginSchema.safeParse(req.body);
  const password = parsed.success ? parsed.data.password : "";
  if (!verifyPassword(password)) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }
  const token = signToken();
  res.json({ success: true, token, expiresIn: config.adminTokenTtlSeconds });
};
