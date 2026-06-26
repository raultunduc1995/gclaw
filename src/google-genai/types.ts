import { type Part } from "@google/genai";

// Core content blocks
export type ContentPart = Part;

export interface MessageParam {
  role: "user" | "model";
  parts: Array<ContentPart>;
}

export interface Message {
  type: "message";
  role: "user" | "model";
  parts: Array<ContentPart>;
  totalTokenCount: number;
}

// Discriminator wrapper remains intact so your downstream orchestration loop works seamlessly
export type QueryTurn = { role: "user"; turn: MessageParam } | { role: "model"; turn: Message };

export class RefusalError extends Error {
  constructor(message = "Gemini refused to process this request due to safety or policy blocks") {
    super(message);
    this.name = "RefusalError";
  }
}
