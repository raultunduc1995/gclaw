import { Temporal } from "@js-temporal/polyfill";

import { query } from "../google-genai/index.js";
import type { MessageParam, ContentBlockParam } from "../google-genai/index.js";
import { logger, TIMEZONE } from "../core/utils/index.js";
import type { RegisteredGroup, HistoryEntry } from "../core/repositories/index.js";
import { type InboundMessage, Channel } from "../channels/index.js";

export interface GeminiAgentDeps {
  repository: {
    history: {
      getHistory(chatJid: string, limit?: number): HistoryEntry[];
      addMessage(chatJid: string, role: string, parts: Array<ContentBlockParam>): void;
    };
    groups: {
      registerGroup(jid: string, name: string, folder: string): RegisteredGroup;
    };
  };
  channelsRegistry: {
    findChannel(chatJid: string): Channel | undefined;
  };
}

const formatDateTime = (): string => Temporal.Now.zonedDateTimeISO(TIMEZONE).toPlainDateTime().toString({ fractionalSecondDigits: 0 });
const wrapMessage = (senderName: string, content: string): string => `[${formatDateTime()}] ${senderName}:\n${content}`;

export const createGeminiAgent = (deps: GeminiAgentDeps) => {
  const groupChains = new Map<string, Promise<void>>();

  const processAgentTurn = async (msg: InboundMessage, group: RegisteredGroup) => {
    const chatJid = msg.chatJid;
    const channel = deps.channelsRegistry.findChannel(chatJid);
    if (!channel) {
      logger.error({ chatJid }, "Channel not found for message dispatch");
      return;
    }

    try {
      // 1. Fetch chat history from DB
      const messages: MessageParam[] = deps.repository.history.getHistory(chatJid);

      // 2. Append new user message to local history and database
      const userParts: Array<ContentBlockParam> = [];
      if (msg.kind === "image") {
        userParts.push({
          inlineData: {
            mimeType: msg.imageMimeType,
            data: msg.imageBase64,
          },
        });
      }
      if (msg.prompt) {
        userParts.push({ text: wrapMessage(msg.userName, msg.prompt) });
      }

      messages.push({ role: "user", parts: userParts });
      deps.repository.history.addMessage(chatJid, "user", userParts);

      // 3. Keep the user updated with a typing indicator
      await channel.setTyping(chatJid);

      // 4. Run the query loop from google-genai module
      let finalText = "";

      for await (const turn of query(messages, group)) {
        const role = turn.role;
        const parts = turn.turn.parts;

        // Save everything returned to the database so history stays complete
        deps.repository.history.addMessage(chatJid, role, parts);

        if (role === "user") continue;

        // Keep sending typing indicator if model is still thinking / calling tools
        await channel.setTyping(chatJid);

        for (const part of parts) {
          if (part.thought && part.text) {
            await channel.sendMessage(chatJid, `Gemini thought:\n\n${part.text}\n`);
          }

          if (part.text) {
            finalText += part.text;
          }
        }
      }

      if (finalText) {
        await channel.sendMessage(chatJid, finalText);
      }
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error({ chatJid: chatJid, err: errMessage }, "Error during agent loop processing");
      await channel.sendMessage(chatJid, `⚠️ An error occurred during processing: ${errMessage}.`);
    }
  };

  const handleInboundMessage = (msg: InboundMessage, group: RegisteredGroup) => {
    const chatJid = msg.chatJid;
    const previousRun = groupChains.get(chatJid) || Promise.resolve();

    const currentRun = (async () => {
      try {
        await previousRun;
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error({ chatJid, err: errMessage }, "Error in preceding queue execution segment");
      }
      await processAgentTurn(msg, group);
    })().finally(() => {
      if (groupChains.get(chatJid) === currentRun) {
        groupChains.delete(chatJid);
      }
    });

    groupChains.set(chatJid, currentRun);
  };

  return {
    handleInboundMessage,
  };
};
