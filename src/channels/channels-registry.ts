import { createTelegramChannel, type TelegramChannelDeps } from "./telegram/telegram.js";
import type { Channel } from "./types.js";

export interface ChannelsRegistry {
  registerTelegramChannel: (opts: TelegramChannelDeps) => Channel;
  findChannel: (jid: string) => Channel | undefined;
  connectAll: () => Promise<void>;
  disconnectAll: () => Promise<void>;
}

export const createChannelsRegistry = (): ChannelsRegistry => {
  const channels = new Map<string, Channel>();

  return {
    registerTelegramChannel: (opts) => {
      const channel = createTelegramChannel(opts);
      channels.set("telegram", channel);
      return channel;
    },

    findChannel: (jid) => {
      const telegramChannel = channels.get("telegram");
      if (!(telegramChannel && telegramChannel.ownsJid(jid))) {
        return undefined;
      }
      return telegramChannel;
    },

    connectAll: async () => {
      for (const [_, channel] of channels) {
        await channel.connect();
      }
    },

    disconnectAll: async () => {
      for (const [_, channel] of channels) {
        await channel.disconnect();
      }
    },
  };
};
