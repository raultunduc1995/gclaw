/* eslint-disable no-catch-all/no-catch-all */
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
      clearHistory(chatJid: string): void;
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

  const buildUserParts = (msg: InboundMessage): Array<ContentBlockParam> => {
    const parts: Array<ContentBlockParam> = [];
    if (msg.kind === "image") {
      parts.push({
        inlineData: {
          mimeType: msg.imageMimeType,
          data: msg.imageBase64,
        },
      });
    }
    if (msg.prompt) {
      parts.push({ text: wrapMessage(msg.userName, msg.prompt) });
    }
    return parts;
  };

  const runInternal = async (msg: InboundMessage, group: RegisteredGroup, channel: Channel): Promise<{ finalText: string; totalTokenCount: number } | null> => {
    const chatJid = msg.chatJid;

    const userParts = buildUserParts(msg);
    if (userParts.length === 0) return null;

    const messages: MessageParam[] = deps.repository.history.getHistory(chatJid);
    messages.push({ role: "user", parts: userParts });
    deps.repository.history.addMessage(chatJid, "user", userParts);

    await channel.setTyping(chatJid);

    // 4. Run the query loop from google-genai module
    let finalText = "";
    let totalTokenCount: number = 0;
    for await (const turn of query(messages, group)) {
      const role = turn.role;
      const parts = turn.turn.parts;

      if (role === "user") {
        deps.repository.history.addMessage(chatJid, role, parts);
        continue;
      }

      // Filter out thoughts before saving to history
      const savedParts = parts.filter((part) => !part.thought);
      deps.repository.history.addMessage(chatJid, role, savedParts);

      // Keep sending typing indicator if model is still thinking / calling tools
      await channel.setTyping(chatJid);

      totalTokenCount = turn.turn.totalTokenCount;
      for (const part of parts) {
        if (part.thought && part.text && part.text.length > 0) {
          await channel.sendMessage(chatJid, `Gemini thought:\n\n${part.text}\n`);
          continue;
        }

        if (part.text && part.text.length > 0) finalText += part.text;
      }
    }

    if (finalText) await channel.sendMessage(chatJid, finalText);
    if (totalTokenCount > 0) await channel.sendMessage(chatJid, `total-tokens-count: ${totalTokenCount}`);

    return { finalText, totalTokenCount };
  };

  const runCompaction = async (group: RegisteredGroup, channel: Channel) => {
    const chatJid = group.jid;
    logger.warn({ chatJid }, "Total prompt tokens approaching model limit, running compaction");

    const summaryResult = await runInternal(
      {
        id: Date.now().toString(),
        kind: "text",
        chatJid,
        userName: "System",
        prompt: `Summarize the entire conversation and send it back to me.\nInclude: key topics discussed, decisions made, technical details, action items, and any important context for continuing the conversation.\nWrite a dense, factual summary. Write the summary in the same language used in the conversation.`,
      },
      group,
      channel,
    );

    if (!summaryResult) return;

    deps.repository.history.clearHistory(chatJid);

    await runInternal(
      {
        id: Date.now().toString(),
        kind: "text",
        chatJid,
        userName: "System",
        prompt: `Context was compacted. Read the convo summary below:\n\n${summaryResult.finalText}`,
      },
      group,
      channel,
    );
  };

  const processAgentTurn = async (msg: InboundMessage, group: RegisteredGroup) => {
    const chatJid = msg.chatJid;
    const channel = deps.channelsRegistry.findChannel(chatJid);
    if (!channel) {
      logger.error({ chatJid }, "Channel not found for message dispatch");
      return;
    }

    try {
      const result = await runInternal(msg, group, channel);
      if (!result) return;
      if (result.totalTokenCount > 150_000) await runCompaction(group, channel);
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
      } finally {
        await processAgentTurn(msg, group);
      }
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
