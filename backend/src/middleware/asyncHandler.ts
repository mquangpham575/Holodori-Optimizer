import type { Request, Response, NextFunction } from "express";

// Wraps an async route handler so thrown/rejected errors are forwarded to the
// centralized error handler instead of crashing the process.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
