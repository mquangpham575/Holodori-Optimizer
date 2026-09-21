import type { Request, Response } from "express";
import config from "../config.js";
import { verifyPassword, signToken } from "../services/authService.js";
import { loginSchema } from "../schemas/index.js";

export const login = (req: Request, res: Response): void => {
  if (!config.adminEnabled) {
    res.status(503).json({ error: "Admin is disabled: set ADMIN_PASSWORD and ADMIN_SECRET" });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  const password = parsed.success ? parsed.data.password : "";
  if (!verifyPassword(password)) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }
  const token = signToken();
  res.json({ success: true, token, expiresIn: config.adminTokenTtlSeconds });
};
