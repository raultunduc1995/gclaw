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
  imageBase64: string;
  imageMimeType: ImageMimeType;
}

interface VideoMessage extends MessageBase {
  kind: "video";
  videoBase64: string;
  videoMimeType: VideoMimeType;
}

interface VoiceMessage extends MessageBase {
  kind: "voice";
  audioBase64: string;
  audioMimeType: AudioMimeType;
}

interface PdfMessage extends MessageBase {
  kind: "pdf";
  pdfBase64: string;
  pdfMimeType: PdfMimeType;
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
