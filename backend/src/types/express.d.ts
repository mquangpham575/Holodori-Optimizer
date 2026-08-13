declare global {
  namespace Express {
    interface Request {
      // Correlation id assigned by the request logger.
      id?: string;
      // Verified admin token payload (set by requireAdmin).
      admin?: { sub: string; iat: number; exp: number };
    }
  }
}

export {};
