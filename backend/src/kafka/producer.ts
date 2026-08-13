import { Kafka, type Producer } from "kafkajs";
import config from "../config.js";
import { logger } from "../logger.js";

// Kafka producer for the catalog.synced event stream. Gracefully degrades to a
// no-op when KAFKA_BROKERS is not set, and stops retrying after a failed
// connect so a down broker never blocks the API.

let client: Kafka | null = null;
let producer: Producer | null = null;
let brokerWarned = false;
let connectFailed = false;

const getProducer = async (): Promise<Producer | null> => {
  if (!config.kafkaBrokers) {
    if (!brokerWarned) {
      logger.warn("KAFKA_BROKERS not set — Kafka producer disabled.");
      brokerWarned = true;
    }
    return null;
  }
  if (connectFailed) return null;

  if (!client) {
    client = new Kafka({
      clientId: "holodreams-api",
      brokers: config.kafkaBrokers.split(",").map((b) => b.trim()),
      connectionTimeout: 3000,
      retry: { retries: 2, initialRetryTime: 200 },
    });
    producer = client.producer();
  }

  try {
    await producer!.connect();
  } catch (err) {
    logger.error({ err }, "Kafka producer connect failed (disabling)");
    connectFailed = true;
    return null;
  }
  return producer;
};

export const publishCatalogSynced = async (payload: Record<string, unknown> = {}): Promise<boolean | null> => {
  const prod = await getProducer();
  if (!prod) return null;
  try {
    await prod.send({
      topic: "catalog.synced",
      messages: [{ value: JSON.stringify({ ...payload, at: new Date().toISOString() }) }],
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Kafka publish failed");
    return null;
  }
};

export const disconnectKafka = async (): Promise<void> => {
  if (producer) {
    await producer.disconnect().catch(() => {});
    producer = null;
  }
};
