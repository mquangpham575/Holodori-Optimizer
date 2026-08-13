import express, { type Express, type Router } from "express";
import cors from "cors";
import config from "./config.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

import healthRoutes from "./routes/health.routes.js";
import charactersRoutes from "./routes/characters.routes.js";
import songsRoutes from "./routes/songs.routes.js";
import presetsRoutes from "./routes/presets.routes.js";
import rosterRoutes from "./routes/roster.routes.js";
import guidesRoutes from "./routes/guides.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import imagesRoutes from "./routes/images.routes.js";
import docsRoutes from "./routes/docs.routes.js";

export const createApp = (): Express => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(requestLogger);

  // Static talent images + card art (Postgres in prod).
  app.use("/images", express.static(config.imagesDir, { maxAge: "30d", index: false }));
  app.use("/images", imagesRoutes);

  // Mount versioned API routes under /api/v1, keeping /api as an alias for
  // backward compatibility with the existing frontend and deploy rewrites.
  const mounts: [string, ReturnType<typeof Router>][] = [
    ["/health", healthRoutes],
    ["/characters", charactersRoutes],
    ["/songs", songsRoutes],
    ["/presets", presetsRoutes],
    ["/roster", rosterRoutes],
    ["/guides", guidesRoutes],
    ["/admin", adminRoutes],
    ["/docs", docsRoutes],
  ];
  for (const [sub, router] of mounts) {
    app.use(`/api/v1${sub}`, router);
    app.use(`/api${sub}`, router);
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
