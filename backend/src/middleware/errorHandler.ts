import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

interface HttpError extends Error {
  status?: number;
}

// Centralized error handler. Maps errors carrying a `status` field to the
// matching HTTP status; everything else becomes a 500.
export const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = Number(err.status) >= 400 ? Number(err.status) : 500;
  if (status >= 500) {
    logger.error({ err, requestId: req.id }, "Unhandled error");
  }
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message || "Request failed",
  });
};
