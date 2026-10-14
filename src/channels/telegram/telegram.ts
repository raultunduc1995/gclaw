import https from "https";
import { autoRetry } from "@grammyjs/auto-retry";
import { Api, Bot, BotError } from "grammy";
import { TELEGRAM_BOT_TOKEN, logger } from "../../core/utils/index.js";
import type { Channel, InboundMessage } from "../types.js";
import { toTelegramHTML } from "./telegram-html-converter.js";
import type { SqliteRepository, RegisteredGroup } from "../../core/repositories/index.js";
import type { AudioMimeType, ImageMimeType, PdfMimeType, VideoMimeType } from "../../core/common/index.js";

type MediaMimeType = ImageMimeType | VideoMimeType | AudioMimeType | PdfMimeType;

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
      const blob = await downloadTelegramFileAsBlob(ctx.api, largest.file_id, "image/jpeg");
      if (!blob) {
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
          mimeType: "image/jpeg",
          blob,
        },
        group,
      );
    });

    bot.on(["message:video", "message:animation"], async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = opts.repository.groups.getGroups()[chatJid];
      if (!group) {
        logger.warn({ chatJid }, "Message from unregistered Telegram chat");
        return;
      }

      const msg = ctx.message;
      const video = "video" in msg && msg.video ? msg.video : "animation" in msg && msg.animation ? msg.animation : null;
      if (!video) return;

      const userName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id.toString() || "Unknown";
      const msgId = msg.message_id.toString();
      const content = msg.caption || "";

      const fileSize = video.file_size || 0;
      if (fileSize > 15 * 1024 * 1024) {
        logger.warn({ chatJid, fileSize }, "Video exceeds 15MB limit");
        await ctx.reply("The video is too large. Please send a video under 15MB.");
        return;
      }

      const mimeType = (video.mime_type || "video/mp4") as VideoMimeType;
      const validVideoMimeTypes = ["video/mp4", "video/mpeg", "video/quicktime", "video/webm"];
      if (!validVideoMimeTypes.includes(mimeType)) {
        logger.warn({ chatJid, mimeType }, "Unsupported video mime type received from Telegram");
        return;
      }

      const fileId = video.file_id;
      const blob = await downloadTelegramFileAsBlob(ctx.api, fileId, mimeType);
      if (!blob) {
        logger.error({ chatJid, fileId }, "Failed to download Telegram video");
        return;
      }

      opts.agent.handleInboundMessage(
        {
          kind: "video",
          id: msgId,
          chatJid,
          userName,
          prompt: content,
          mimeType,
          blob,
        },
        group,
      );
    });

    bot.on("message:voice", async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = opts.repository.groups.getGroups()[chatJid];
      if (!group) {
        logger.warn({ chatJid }, "Message from unregistered Telegram chat");
        return;
      }

      const userName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id.toString() || "Unknown";
      const msgId = ctx.message.message_id.toString();
      const content = ctx.message.caption || "";
      const voice = ctx.message.voice;

      const mimeType = (voice.mime_type || "audio/ogg") as AudioMimeType;
      const blob = await downloadTelegramFileAsBlob(ctx.api, voice.file_id, mimeType);
      if (!blob) {
        logger.error({ chatJid, fileId: voice.file_id }, "Failed to download Telegram voice note");
        return;
      }

      opts.agent.handleInboundMessage(
        {
          kind: "voice",
          id: msgId,
          chatJid,
          userName,
          prompt: content,
          mimeType,
          blob,
        },
        group,
      );
    });

    bot.on("message:document", async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = opts.repository.groups.getGroups()[chatJid];
      if (!group) {
        logger.warn({ chatJid }, "Message from unregistered Telegram chat");
        return;
      }

      const doc = ctx.message.document;
      const mimeType = doc.mime_type;
      const userName = ctx.from?.first_name || ctx.from?.username || ctx.from?.id.toString() || "Unknown";
      const msgId = ctx.message.message_id.toString();
      const content = ctx.message.caption || "";
      const fileId = doc.file_id;

      if (mimeType && (mimeType.startsWith("video/") || mimeType === "image/gif")) {
        const videoMime: VideoMimeType = "video/mp4";
        const blob = await downloadTelegramFileAsBlob(ctx.api, fileId, videoMime);
        if (!blob) {
          logger.error({ chatJid, fileId }, "Failed to download Telegram video document");
          return;
        }
        opts.agent.handleInboundMessage(
          {
            kind: "video",
            id: msgId,
            chatJid,
            userName,
            prompt: content,
            mimeType: videoMime,
            blob,
          },
          group,
        );
        return;
      }

      if (mimeType === "application/pdf") {
        const blob = await downloadTelegramFileAsBlob(ctx.api, fileId, "application/pdf");
        if (!blob) {
          logger.error({ chatJid, fileId }, "Failed to download Telegram PDF document");
          return;
        }

        opts.agent.handleInboundMessage(
          {
            kind: "pdf",
            id: msgId,
            chatJid,
            userName,
            prompt: content,
            mimeType: "application/pdf",
            blob,
          },
          group,
        );
        return;
      }
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

const downloadTelegramFileAsBlob = async (api: Api, fileId: string, mimeType: MediaMimeType): Promise<Blob | undefined> => {
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

    return new Blob([buffer], { type: mimeType });
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
