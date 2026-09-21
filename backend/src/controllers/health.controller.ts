import type { Request, Response } from "express";
import config from "../config.js";
import { getPool } from "../db/postgres.js";
import { getMetrics } from "../metrics.js";
import { logger } from "../logger.js";

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  let postgresStatus = "operational";
  if (config.isProd) {
    try {
      const client = await getPool().connect();
      await client.query("SELECT 1");
      client.release();
    } catch (err) {
      logger.error({ err }, "Health check failed for Postgres");
      postgresStatus = "offline";
    }
  } else {
    postgresStatus = "local_file_db";
  }

  const isAllOperational = postgresStatus === "operational" || postgresStatus === "local_file_db";
  res.json({
    status: isAllOperational ? "operational" : "degraded",
    services: {
      backend: "operational",
      postgres: postgresStatus,
    },
  });
};

export const getMetricsJson = (_req: Request, res: Response): void => {
  res.set("Cache-Control", "no-store");
  res.json(getMetrics());
};
