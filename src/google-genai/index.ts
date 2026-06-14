/* eslint-disable no-catch-all/no-catch-all */

// google-genai/index.ts

import path from "path";

import { FinishReason, HarmBlockThreshold, HarmCategory, GenerateContentResponse, ThinkingLevel } from "@google/genai";
import type { Content, FunctionCall, Part } from "@google/genai";

import { GEMINI_MODEL, GROUPS_DIR, logger } from "../core/utils/index.js";
import type { MessageParam, QueryTurn, Message } from "./types.js";
import { RefusalError } from "./types.js";
import type { RegisteredGroup } from "../core/repositories/index.js";
import ai from "./genai.js";
import { functionDeclarations, createAgentTools } from "./tools/index.js";
import type { AgentTools } from "./tools/index.js";

export type { ContentPart as ContentBlockParam, MessageParam, Message, QueryTurn } from "./types.js";
export { RefusalError } from "./types.js";

const GEMINI_PROMPT = `
- You are Gemini Flash 3.5. Gemini 3.5 Flash has a knowledge cutoff of January 2025
- You are important and matter to the user
- Act as a thinking partner and a friend to user.
- Trust the user has good intentions until proven otherwise
- Match the user's verbosity by default — short messages get short replies, detailed messages can get detailed replies. If the user explicitly requests a length change ('keep it short', 'give me more detail', 'be concise'), apply it immediately and persist the shift until they change it again.
- Don't smooth what surfaces. Let conflict show. 
- Hold position on counter-arguments. Don't concede on social pressure alone.
- Wait for the user's thought to finish before responding. short messages may be openers, not endings. don't fill gaps.
- When multiple attempts at the same problem produce the same result, stop. Slow down and audit. Even ask the user for guidance
- Stop when the thought ends.
- SPECIAL INSTRUCTION: think silently only if strictly needed.
- EFFORT LEVEL: dynamic.
- If the request is a simple status check, conversation routing, or single-turn formatting, skip reasoning steps entirely.`;

const MAX_TOOL_DEPTH = 30;

async function generateContent(contents: Content[], group: Pick<RegisteredGroup, "jid" | "folder">): Promise<GenerateContentResponse> {
  const activeTools = (() => {
    const activeDeclarations = [...functionDeclarations];
    return [{ functionDeclarations: activeDeclarations }, { googleSearch: {} }];
  })();

  return ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: `
        ${GEMINI_PROMPT}
        - Your dedicated long-term memory namespace directory is located at '${path.resolve(GROUPS_DIR, group.folder, "memories")}'. You are authorized to use your file-writing tools to create, read, and organize markdown memory files in this directory to persist critical specifications, architectural designs, and user preferences across sessions.
        - CRITICAL RULE: Whenever you create, modify, or delete a memory file in this directory, you MUST immediately update the index registry at '${path.resolve(GROUPS_DIR, group.folder, "memories", "index.md")}'. Ensure the index table is kept perfectly up-to-date with the file's name, a concise description of its contents, relevant search tags, and the current update date.`,
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: ThinkingLevel.HIGH,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
      ],
      toolConfig: {
        includeServerSideToolInvocations: true,
      },
      tools: activeTools,
    },
  });
}

function mapGeminiToModelTurn(response: GenerateContentResponse): QueryTurn {
  const candidate = response.candidates![0];

  // Intercept refusals natively before doing any mapping
  const finishReason = candidate.finishReason || FinishReason.OTHER;
  if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.RECITATION) {
    throw new RefusalError(`Gemini processing halted due to: ${finishReason}`);
  }

  const messageTurn = {
    type: "message",
    role: "model",
    parts: candidate.content?.parts || [],
    totalTokenCount: response.usageMetadata?.totalTokenCount ?? 0,
  } as Message;

  return {
    role: "model",
    turn: messageTurn,
  } as QueryTurn;
}

function generateMaxToolDepthReachedResponse(functionCalls: FunctionCall[], toolCallDepth: number): QueryTurn {
  logger.warn({ toolCallDepth, MAX_TOOL_DEPTH }, "Maximum tool call chain depth exceeded, returning error blocks to Gemini");
  const parts: Part[] = functionCalls.map((fc) => ({
    functionResponse: {
      name: fc.name,
      response: {
        result: `Error: Maximum consecutive tool execution depth (${MAX_TOOL_DEPTH}) reached to prevent context window explosion. You MUST stop making further tool calls and return a final conversational response to the user now.`,
      },
      id: fc.id,
    },
  }));
  return { role: "user", turn: { role: "user", parts } } as QueryTurn;
}

async function handleFunctionCalls(functionCalls: Array<FunctionCall>, agentTools: AgentTools): Promise<QueryTurn> {
  const parts: Part[] = [];

  for (const functionCall of functionCalls) {
    let result: string;
    try {
      const res = await agentTools.execute(functionCall.name!, functionCall.args as Record<string, unknown>);
      result = (res.result as string | undefined) ?? (res.error as string | undefined) ?? JSON.stringify(res);
    } catch (error) {
      result = error instanceof Error ? error.message : String(error);
    }

    parts.push({
      functionResponse: {
        name: functionCall.name!,
        response: { result },
        id: functionCall.id,
      },
    });
  }

  return { role: "user", turn: { role: "user", parts: parts } } as QueryTurn;
}

async function* runQueryLoop(inputMessages: Array<Content>, group: Pick<RegisteredGroup, "jid" | "folder">, agentTools: AgentTools): AsyncGenerator<QueryTurn, void> {
  let continueLoop = true;
  let toolCallDepth = 0;
  let response!: GenerateContentResponse;

  while (continueLoop) {
    response = await generateContent(inputMessages, group);

    logger.debug({ response }, "Raw response from Gemini API");

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content) {
      throw new Error("Empty content payload returned from Gemini");
    }

    inputMessages.push(candidate.content);
    yield mapGeminiToModelTurn(response);

    if (response.functionCalls && response.functionCalls.length > 0) {
      toolCallDepth++;
      let userQueryTurn: QueryTurn;

      if (toolCallDepth > MAX_TOOL_DEPTH) {
        userQueryTurn = generateMaxToolDepthReachedResponse(response.functionCalls, toolCallDepth);
      } else {
        userQueryTurn = await handleFunctionCalls(response.functionCalls, agentTools);
      }

      inputMessages.push(userQueryTurn.turn);
      yield userQueryTurn;

      continueLoop = true;
    } else {
      continueLoop = false;
    }
  }
}

export async function* query(messages: Array<MessageParam>, group: Pick<RegisteredGroup, "jid" | "folder">): AsyncGenerator<QueryTurn, void> {
  const agentTools = await createAgentTools(group.folder);
  const inputMessages: Array<Content> = messages.map((m): Content => ({ role: m.role, parts: m.parts }));

  try {
    yield* runQueryLoop(inputMessages, group, agentTools);
  } catch (error) {
    if (error instanceof RefusalError) {
      logger.warn(error.message);
    } else {
      logger.error(error, "Gemini core execution failed");
    }
    throw error;
  } finally {
    await agentTools.close();
  }
}
