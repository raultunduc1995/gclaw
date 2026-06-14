import { ImageMimeType } from "../core/common/index.js";

interface MessageBase {
  id: string;
  chatJid: string;
  userName: string;
  prompt: string;
}

interface TextMessage extends MessageBase {
  kind: "text";
}

interface ImageMessage extends MessageBase {
  kind: "image";
  imageBase64: string;
  imageMimeType: ImageMimeType;
}

export type InboundMessage = TextMessage | ImageMessage;

export interface Channel {
  name: string;
  connect: () => Promise<void>;
  sendMessage: (jid: string, text: string) => Promise<void>;
  ownsJid: (jid: string) => boolean;
  disconnect: () => Promise<void>;
  // Optional: typing indicator. Channels that support it implement it.
  setTyping: (jid: string) => Promise<void>;
}
