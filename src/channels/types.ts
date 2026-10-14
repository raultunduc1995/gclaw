import { ImageMimeType, VideoMimeType, AudioMimeType, PdfMimeType } from "../core/common/index.js";

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
  blob: Blob;
  mimeType: ImageMimeType;
}

interface VideoMessage extends MessageBase {
  kind: "video";
  blob: Blob;
  mimeType: VideoMimeType;
}

interface VoiceMessage extends MessageBase {
  kind: "voice";
  blob: Blob;
  mimeType: AudioMimeType;
}

interface PdfMessage extends MessageBase {
  kind: "pdf";
  blob: Blob;
  mimeType: PdfMimeType;
}

export type InboundMessage = TextMessage | ImageMessage | VideoMessage | VoiceMessage | PdfMessage;

export interface Channel {
  name: string;
  connect: () => Promise<void>;
  sendMessage: (jid: string, text: string) => Promise<void>;
  ownsJid: (jid: string) => boolean;
  disconnect: () => Promise<void>;
  // Optional: typing indicator. Channels that support it implement it.
  setTyping: (jid: string) => Promise<void>;
}
