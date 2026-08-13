import type { Request, Response, NextFunction } from "express";
import { verifyToken, parseBearerToken } from "../services/authService.js";

// Requires a valid signed admin token (issued by POST /api/admin/login).
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const token = parseBearerToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized: missing or invalid admin token" });
    return;
  }
  req.admin = payload;
  next();
};
