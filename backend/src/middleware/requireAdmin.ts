import type { Request, Response, NextFunction } from "express";
import config from "../config.js";
import { verifyToken, parseBearerToken } from "../services/authService.js";

// Requires a valid signed admin token (issued by POST /api/admin/login).
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.adminEnabled) {
    res.status(503).json({ error: "Admin is disabled: set ADMIN_PASSWORD and ADMIN_SECRET" });
    return;
  }
  const token = parseBearerToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized: missing or invalid admin token" });
    return;
  }
  req.admin = payload;
  next();
};
