import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
// backend/src -> backend
const BACKEND_ROOT = path.join(path.dirname(__filename), "..");

export interface AppConfig {
  isProd: boolean;
  /** False when running against a real DB without explicit admin credentials. */
  adminEnabled: boolean;
  trustProxy: boolean | number | string;
  port: number;
  databaseUrl: string | null;
  pgSslDisabled: boolean;
  adminPassword: string;
  adminSecret: string;
  adminTokenTtlSeconds: number;
  dbPath: string;
  imagesDir: string;
  /** Base URL of the CDN that hosts full card illustrations; empty disables the mirror. */
  cardArtCdnBase: string;
  dataJsPath: string;
  kafkaBrokers: string | null;
  logLevel: string;
}

const isProd = !!process.env.DATABASE_URL;

const DEV_ADMIN_PASSWORD = "admin123";
const DEV_ADMIN_SECRET = "dev-admin-secret-change-me";
const KNOWN_WEAK_SECRETS = new Set([DEV_ADMIN_SECRET, "change-me-in-production"]);

// In production (DATABASE_URL set) the admin area stays disabled unless real,
// non-default credentials are supplied. Falling back to a public default
// password would hand the whole catalog to anyone who reads the README.
const adminEnabled =
  !isProd ||
  (!!process.env.ADMIN_PASSWORD &&
    process.env.ADMIN_PASSWORD !== DEV_ADMIN_PASSWORD &&
    !!process.env.ADMIN_SECRET &&
    !KNOWN_WEAK_SECRETS.has(process.env.ADMIN_SECRET));

// Behind Vercel/Code.run/nginx the socket peer is the proxy, so req.ip (used by
// the login rate limiter) is the same for every visitor unless we trust the
// forwarded header. TRUST_PROXY accepts a hop count, "true"/"false" or a
// subnet expression; default is one hop in production.
const parseTrustProxy = (raw: string | undefined): boolean | number | string => {
  if (raw === undefined || raw === "") return isProd ? 1 : false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
};

const config: AppConfig = {
  isProd,
  adminEnabled,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL || null,
  // Hosted Postgres providers require SSL by default; local Postgres (the
  // Docker compose `db` service) does not — disable via PGSSL=false.
  pgSslDisabled: process.env.PGSSL === "false",
  adminPassword: process.env.ADMIN_PASSWORD || DEV_ADMIN_PASSWORD,
  // Secret used to sign admin session tokens (HMAC-SHA256).
  adminSecret: process.env.ADMIN_SECRET || DEV_ADMIN_SECRET,
  adminTokenTtlSeconds: Number(process.env.ADMIN_TOKEN_TTL || 60 * 60 * 24),
  // Overridable via DB_PATH so tests can run against an isolated store.
  dbPath: process.env.DB_PATH || path.join(BACKEND_ROOT, "database.json"),
  imagesDir: path.join(BACKEND_ROOT, "../frontend/public/images"),
  // Full-size card illustrations are mirrored (once per card, revalidated weekly)
  // from this CDN into our own store. Set CARD_ART_CDN_BASE="" to turn it off.
  cardArtCdnBase: (process.env.CARD_ART_CDN_BASE ?? "https://cdn.holodori.dev").trim(),
  dataJsPath: path.join(BACKEND_ROOT, "../frontend/src/data.js"),
  kafkaBrokers: process.env.KAFKA_BROKERS || null,
  logLevel: process.env.LOG_LEVEL || "info",
};

export default config;
