import crypto from "node:crypto";
import type { Request } from "express";
import config from "../config.js";

// Stateless admin session tokens (JWT-shaped, HMAC-SHA256) using Node's
// built-in crypto — no extra dependency. The password itself is only sent once
// to /api/admin/login and compared in constant time.

const b64url = (buf: Buffer) => buf.toString("base64url");
const b64urlDecode = (str: string) => Buffer.from(str, "base64url");

export const verifyPassword = (candidate?: string): boolean => {
  if (!candidate) return false;
  // Constant-time compare over SHA-256 digests (avoids timing/length leaks).
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
};

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export const signToken = (ttlSeconds: number = config.adminTokenTtlSeconds): string => {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Date.now();
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        sub: "admin",
        iat: Math.floor(now / 1000),
        exp: Math.floor((now + ttlSeconds * 1000) / 1000),
      })
    )
  );
  const signature = crypto
    .createHmac("sha256", config.adminSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
};

export const verifyToken = (token?: string | null): TokenPayload | null => {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = crypto
    .createHmac("sha256", config.adminSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(b64urlDecode(payload).toString("utf8")) as TokenPayload;
    if (typeof data.exp !== "number" || Date.now() / 1000 > data.exp) return null;
    return data;
  } catch {
    return null;
  }
};

export const parseBearerToken = (req: Request): string | null => {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};
