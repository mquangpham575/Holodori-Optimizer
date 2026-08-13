import pino from "pino";
import config from "./config.js";

// Structured JSON logger (pino). Replace console.log in new code paths; the
// requestLogger middleware emits one log line per request with a correlation id.
export const logger = pino({
  level: config.logLevel,
  base: { service: "holodreams-api" },
});
