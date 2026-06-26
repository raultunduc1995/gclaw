import { createSqliteRepository } from "./core/repositories/index.js";
import { createChannelsRegistry } from "./channels/index.js";
import { createGeminiAgent, type GeminiAgent } from "./gemini-agent/index.js";
import { logger } from "./core/utils/index.js";

const main = async (): Promise<void> => {
  logger.info("Starting GClaw Bot...");

  let geminiAgent!: GeminiAgent;

  const repository = createSqliteRepository({
    onReminderTrigger: (row) => {
      try {
        const group = repository.groups.getGroups()[row.chat_jid];
        if (group) {
          logger.info({ id: row.id, chatJid: row.chat_jid }, "Firing scheduled reminder");
          geminiAgent.handleInboundMessage(
            {
              kind: "text",
              id: `rem-${row.id}`,
              chatJid: row.chat_jid,
              userName: "System",
              prompt: `[SYSTEM NOTIFICATION: A reminder you scheduled has just triggered. Deliver the following message naturally to the user now: "${row.description}"]`,
            },
            group,
          );
        }
      } catch (err) {
        logger.error({ err, id: row.id }, "Error firing reminder callback");
      }
    },
  });

  const channelsRegistry = createChannelsRegistry();

  geminiAgent = createGeminiAgent({
    repository,
    channelsRegistry,
  });

  channelsRegistry.registerTelegramChannel({
    type: "telegram",
    agent: geminiAgent,
    repository,
  });

  await channelsRegistry.connectAll();

  repository.reminders.scheduleAllReminders();

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
