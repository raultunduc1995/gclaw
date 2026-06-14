import { createSqliteRepository } from "./core/repositories/index.js";
import { createChannelsRegistry } from "./channels/index.js";
import { createGeminiAgent } from "./gemini-agent/index.js";
import { logger } from "./core/utils/index.js";

const main = async (): Promise<void> => {
  logger.info("Starting GClaw Bot...");

  const repository = createSqliteRepository();
  const channelsRegistry = createChannelsRegistry();
  const geminiAgent = createGeminiAgent({
    repository,
    channelsRegistry,
  });

  channelsRegistry.registerTelegramChannel({
    type: "telegram",
    agent: geminiAgent,
    repository,
  });

  await channelsRegistry.connectAll();

  const shutdown = async (): Promise<void> => {
    logger.info("Graceful shutdown initiated...");
    await channelsRegistry.disconnectAll();
    repository.close();
    logger.info("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown().catch((err) => {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown().catch((err) => {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    });
  });
};

export default main;
