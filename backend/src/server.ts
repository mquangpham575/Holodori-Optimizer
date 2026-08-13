import config from "./config.js";
import createApp from "./app.js";
import { seedDatabase, syncHolodoriCards } from "./services/syncService.js";
import { disconnectKafka } from "./kafka/producer.js";
import { closePool } from "./db/postgres.js";
import { logger } from "./logger.js";

// Seed the active store (Postgres in prod, JSON file locally), then keep card
// data fresh with the upstream HolodoriDB sync on boot and every 6 hours.
await seedDatabase();
syncHolodoriCards();
setInterval(syncHolodoriCards, 6 * 60 * 60 * 1000);

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`Backend API Server running on port ${config.port}`);
});

// Graceful shutdown: stop accepting connections, then close Kafka + Postgres.
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutting down...");
  server.close(async () => {
    try {
      await disconnectKafka();
      await closePool();
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
    }
    process.exit(0);
  });
  // Force-exit if connections hold the server open.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
