import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
// backend/src -> backend
const BACKEND_ROOT = path.join(path.dirname(__filename), "..");

export interface AppConfig {
  isProd: boolean;
  port: number;
  databaseUrl: string | null;
  pgSslDisabled: boolean;
  adminPassword: string;
  adminSecret: string;
  adminTokenTtlSeconds: number;
  dbPath: string;
  imagesDir: string;
  dataJsPath: string;
  kafkaBrokers: string | null;
  logLevel: string;
}

const isProd = !!process.env.DATABASE_URL;

const config: AppConfig = {
  isProd,
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL || null,
  // Hosted Postgres providers require SSL by default; local Postgres (the
  // Docker compose `db` service) does not — disable via PGSSL=false.
  pgSslDisabled: process.env.PGSSL === "false",
  adminPassword: isProd
    ? process.env.ADMIN_PASSWORD || "admin123"
    : "admin123",
  // Secret used to sign admin session tokens (HMAC-SHA256).
  adminSecret: process.env.ADMIN_SECRET || "dev-admin-secret-change-me",
  adminTokenTtlSeconds: Number(process.env.ADMIN_TOKEN_TTL || 60 * 60 * 24),
  // Overridable via DB_PATH so tests can run against an isolated store.
  dbPath: process.env.DB_PATH || path.join(BACKEND_ROOT, "database.json"),
  imagesDir: path.join(BACKEND_ROOT, "../frontend/public/images"),
  dataJsPath: path.join(BACKEND_ROOT, "../frontend/src/data.js"),
  kafkaBrokers: process.env.KAFKA_BROKERS || null,
  logLevel: process.env.LOG_LEVEL || "info",
};

export default config;
