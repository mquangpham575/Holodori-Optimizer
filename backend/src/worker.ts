import { runCatalogConsumer } from "./kafka/consumer.js";
import { closePool } from "./db/postgres.js";
import { logger } from "./logger.js";

// Standalone worker process. Consumes catalog.synced events and rebuilds the
// precomputed character search index. Runs as its own service in Docker.
const consumer = await runCatalogConsumer();

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Worker shutting down...");
  try {
    if (consumer) await consumer.disconnect().catch(() => {});
    await closePool();
  } catch (err) {
    logger.error({ err }, "Error during worker shutdown");
  }
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
