import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { recordRequest } from "../metrics.js";

// Structured request logging with a correlation id + lightweight metrics.
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  req.id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        route: req.route?.path || req.path,
        status: res.statusCode,
        ms,
        requestId: req.id,
        deviceId: (req.headers["x-device-id"] as string) || undefined,
      },
      "request"
    );
    recordRequest(req.route?.path || req.path || req.originalUrl, res.statusCode);
  });

  next();
};
