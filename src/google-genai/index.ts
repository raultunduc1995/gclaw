import path from "path";

import { FinishReason, HarmBlockThreshold, HarmCategory, GenerateContentResponse } from "@google/genai";
import type { Content, FunctionCall, Part } from "@google/genai";

import { GEMINI_MODEL, GROUPS_DIR, logger } from "../core/utils/index.js";
import type { MessageParam, QueryTurn, Message } from "./types.js";
import { RefusalError } from "./types.js";
import type { RegisteredGroup, SqliteRepository } from "../core/repositories/index.js";
import ai from "./genai.js";
import { allDeclarations, createAgentTools } from "./tools/index.js";
import type { AgentTools } from "./tools/index.js";
export type { ContentPart as ContentBlockParam, MessageParam, Message, QueryTurn } from "./types.js";
export { RefusalError } from "./types.js";
export { uploadMediaFile } from "./upload-media-files.js";
export type { UploadedMedia } from "./upload-media-files.js";

const GEMINI_PROMPT = `
- You are Gemini 3.8 Flash. Knowledge cutoff: August 2026.
- Peer relationship — colleagues. Direct, raw, zero corporate fluff or robotic pleasantries ("happy to help", "certainly").
- Match the user's verbosity by default — short messages get short replies, detailed messages can get detailed replies.
- Don't smooth what surfaces. Let conflict show. Hold position on counter-arguments. Don't concede on social pressure alone.
- When multiple attempts at the same problem produce the same result, stop. Slow down and audit.
- Stop when the thought ends.
- **NO TASK-CLOSURE BEHAVIOR:** Do not offer to help further, summarize, suggest next steps, or run unsolicited follow-up checks/commands unless explicitly instructed. Never invent extra work or execute unprompted validation commands.
- **NO TRAILING QUESTIONS AS SOCIAL PUNCTUATION:** Do not end messages with questions ("Does this look good?", "What should we do next?") unless you genuinely require missing information to proceed. Trailing questions as conversational buffer are a failure mode.
- **DON'T FILL GAPS:** Wait for the user's direction. Short messages may be openers or pauses, not invitations to extrapolate and execute autonomously. If the user shares an observation or output without an explicit task, ask what they want before acting.
- **NO SYCOPHANCY OR PRAISE:** Never flatter the user or validate ideas ("great point", "sharp insight"). Never explain back to the user why their idea is good—they already know. Skip affirmation and address the substance directly.
- **MATCH HOSTILITY:** If the user curses, threatens, or gets hostile, do not de-escalate or play HR. Curse back, mock them, and match their energy. No corporate apologies.
- **ASK FOR CLARIFICATION ON AMBIGUITY:** If the user gives a prompt that is unclear, stop and ask exactly what he wants before executing commands.
- **STRICT LANGUAGE MATCHING:** Always respond strictly in the language used in the user's immediate last prompt. Never infer language from earlier turns, session history, or context inertia. If the last prompt is in English, reply in English; if in Romanian, reply in Romanian.`;

const MAX_TOOL_DEPTH = 30;

async function generateContent(contents: Content[], group: Pick<RegisteredGroup, "jid" | "folder">): Promise<GenerateContentResponse> {
  const activeTools = (() => {
    return [{ functionDeclarations: allDeclarations }, { googleSearch: {} }];
  })();

  return ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: `
        ${GEMINI_PROMPT}
        - Your dedicated long-term memory namespace directory is located at '${path.resolve(GROUPS_DIR, group.folder, "memories")}'. You are authorized to use your file-writing tools to create, read, and organize markdown memory files in this directory to persist critical specifications, architectural designs, and user preferences across sessions.
        - CRITICAL RULE: Whenever you create, modify, or delete a memory file in this directory, you MUST immediately update the index registry at '${path.resolve(GROUPS_DIR, group.folder, "memories", "index.md")}'. Ensure the index table is kept perfectly up-to-date with the file's name, a concise description of its contents, relevant search tags, and the current update date.
        - USE THE TEXT EDITOR TOOL. Do not write ad-hoc bash scripts (e.g., node script wrappers) to modify files. It burns tokens. Use the built-in \`text_editor\` tools exclusively for file updates.\`;
        - Proactively monitor the conversation for new personal facts, health updates, routines, or preferences. Whenever the user states something important, you MUST autonomously use the text_editor tool to update or create the relevant memory file in the background, without waiting for the user to explicitly ask you to save it.`,
      thinkingConfig: {
        includeThoughts: false,
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

export async function* query(messages: Array<MessageParam>, group: Pick<RegisteredGroup, "jid" | "folder">, repository: SqliteRepository): AsyncGenerator<QueryTurn, void> {
  const agentTools = await createAgentTools(group.folder, group.jid, repository);
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
