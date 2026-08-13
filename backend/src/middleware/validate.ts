import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

// Validates request.body against a zod schema. On failure returns 400 with the
// first issue; on success stores the parsed value on res.locals.validated.
export const validate = (schema: ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues[0]?.message || "Validation failed";
      res.status(400).json({ error: message });
      return;
    }
    res.locals.validated = result.data;
    next();
  };
};
