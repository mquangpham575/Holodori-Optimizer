import type { Request, Response, NextFunction } from "express";

// Simple in-memory sliding-window rate limiter keyed by IP + route.
const buckets = new Map<string, { count: number; resetAt: number }>();

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export const rateLimit = ({ windowMs = 60000, max = 120 }: RateLimitOptions = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}|${req.baseUrl || req.path}`;
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    }
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.status(429).json({ error: "Too many requests, slow down." });
      return;
    }
    next();
  };
};
