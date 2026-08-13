import { Kafka, type Consumer } from "kafkajs";
import config from "../config.js";
import { rebuildSearchIndex } from "../repositories/searchIndexRepository.js";
import { logger } from "../logger.js";

// Worker-side consumer for the catalog.synced topic. On each event it rebuilds
// the precomputed card search index that /api/characters/search reads from.
export const runCatalogConsumer = async (): Promise<Consumer | null> => {
  if (!config.kafkaBrokers) {
    logger.warn("KAFKA_BROKERS not set — worker idle.");
    return null;
  }

  const kafka = new Kafka({
    clientId: "holodreams-worker",
    brokers: config.kafkaBrokers.split(",").map((b) => b.trim()),
    retry: { retries: 5 },
  });
  const consumer = kafka.consumer({ groupId: "holodreams-search-index" });

  await consumer.connect();
  await consumer.subscribe({ topic: "catalog.synced", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;
        const payload = JSON.parse(message.value.toString());
        logger.info(`[worker] catalog.synced (version ${payload.version || "?"}) — rebuilding search index...`);
        const count = await rebuildSearchIndex();
        logger.info(`[worker] search index rebuilt: ${count} entries.`);
      } catch (err) {
        logger.error({ err }, "[worker] failed to process catalog.synced");
      }
    },
  });

  logger.info("[worker] catalog consumer running.");
  return consumer;
};
