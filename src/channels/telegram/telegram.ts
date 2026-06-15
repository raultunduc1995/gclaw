import https from "https";
import { autoRetry } from "@grammyjs/auto-retry";
import { Api, Bot, BotError } from "grammy";
import { TELEGRAM_BOT_TOKEN, logger } from "../../core/utils/index.js";
import type { Channel, InboundMessage } from "../types.js";
import { toTelegramHTML } from "./telegram-html-converter.js";
import type { SqliteRepository, RegisteredGroup } from "../../core/repositories/index.js";

export interface TelegramChannelDeps {
  type: "telegram";
  agent: {
    handleInboundMessage(msg: InboundMessage, group: RegisteredGroup): void;
  };
  repository: SqliteRepository;
}

export const createTelegramChannel = (opts: TelegramChannelDeps): Channel => {
  const bot = new Bot(TELEGRAM_BOT_TOKEN, {
    client: {
      baseFetchConfig: { agent: https.globalAgent, compress: true },
    },
  });
  bot.api.config.use(autoRetry());

  const connect = async (): Promise<void> => {
    bot.command("chatid", (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName = chatType === "private" ? ctx.from?.first_name || "Private" : "title" in ctx.chat ? ctx.chat.title || "Unknown" : "Unknown";
      ctx.reply(`Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`, { parse_mode: "Markdown" });
      logger.info(`Register new bot: ${chatId}`);
      opts.repository.groups.registerGroup(`tg:${chatId}`, chatName, `telegram-${chatName}`);
    });

    bot.on("message:text", async (ctx) => {
      if (ctx.message.text.startsWith("/")) return;

      const chatJid = `tg:${ctx.chat.id}`;
      const group = opts.repository.groups.getGroups()[chatJid];
      if (!group) {
        logger.warn({ chatJid }, "Message from unregistered Telegram chat");
        return;
      }

      const userName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id.toString() || "Unknown";
      const msgId = ctx.message.message_id.toString();
      const content = ctx.message.text;

      opts.agent.handleInboundMessage({ kind: "text", id: msgId, chatJid, userName, prompt: content }, group);
    });

    bot.on("message:photo", async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = opts.repository.groups.getGroups()[chatJid];
      if (!group) {
        logger.warn({ chatJid }, "Message from unregistered Telegram chat");
        return;
      }

      const userName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id.toString() || "Unknown";
      const msgId = ctx.message.message_id.toString();
      const content = ctx.message.caption || "";

      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const imageBase64 = await downloadTelegramFileAsBase64(ctx.api, largest.file_id);
      if (!imageBase64) {
        logger.error({ chatJid, fileId: largest.file_id }, "Failed to download Telegram photo");
        return;
      }

      opts.agent.handleInboundMessage(
        {
          kind: "image",
          id: msgId,
          chatJid,
          userName,
          prompt: content,
          imageMimeType: "image/jpeg",
          imageBase64,
        },
        group,
      );
    });

    bot.catch((err: BotError) => {
      logger.error({ err: err.message }, "Telegram bot error");
    });

    return new Promise<void>((resolve) => {
      bot.start({
        onStart: (botInfo) => {
          logger.debug({ username: botInfo.username, id: botInfo.id }, "Telegram bot connected");
          resolve();
        },
      });
    });
  };

  const sendMessage = async (jid: string, text: string, threadId?: string): Promise<void> => {
    try {
      const numericId = jid.replace(/^tg:/, "");
      const options = threadId ? { message_thread_id: parseInt(threadId, 10) } : {};

      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await sendTelegramMessage(bot.api, numericId, text, options);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await sendTelegramMessage(bot.api, numericId, text.slice(i, i + MAX_LENGTH), options);
        }
      }
    } catch (err) {
      logger.error({ jid, err }, "Failed to send Telegram message");
    }
  };

  const ownsJid = (jid: string): boolean => {
    return jid.startsWith("tg:");
  };

  const disconnect = async (): Promise<void> => {
    bot.stop();
    logger.info("Telegram bot stopped");
  };

  const setTyping = async (jid: string): Promise<void> => {
    try {
      const numericId = jid.replace(/^tg:/, "");
      await bot.api.sendChatAction(numericId, "typing");
    } catch (err) {
      logger.error({ jid, err }, "Failed to send Telegram typing indicator");
    }
  };

  return {
    name: "telegram",
    connect,
    sendMessage,
    ownsJid,
    disconnect,
    setTyping,
  };
};

const downloadTelegramFileAsBase64 = async (api: Api, fileId: string): Promise<string | undefined> => {
  try {
    const file = await api.getFile(fileId);
    if (!file.file_path) return undefined;

    const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      https
        .get(url, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        })
        .on("error", reject);
    });

    return (buffer as Buffer).toString("base64");
  } catch (err) {
    logger.error({ fileId, err }, "Failed to download Telegram file");
    return undefined;
  }
};

const sendTelegramMessage = async (api: { sendMessage: Api["sendMessage"] }, chatId: string | number, text: string, options: { message_thread_id?: number } = {}): Promise<void> => {
  const formatted = toTelegramHTML(text);
  try {
    await api.sendMessage(chatId, formatted, {
      ...options,
      parse_mode: "HTML",
    });
  } catch (err) {
    logger.error({ err }, "HTML send failed, falling back to plain text");
    await api.sendMessage(chatId, text, options);
  }
};
