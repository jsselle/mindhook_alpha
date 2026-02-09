import { type Content, GoogleGenAI, type Part } from "@google/genai";
import { getToolDefinitions } from "../tools/definitions.ts";
import type { AttachmentPayload, UserTimeContext } from "../types/messages.ts";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-3-flash-preview";
const MAX_TOOL_ITERATIONS = 10;
const TOOL_BUDGET_EXHAUSTED_MESSAGE =
  "You have reached the maximum number of tool calls for this run. Do not call any more tools. Produce your final user-facing answer now using the available context.";

let genAI: GoogleGenAI | null = null;

export const initGemini = (): void => {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable required");
  }
  genAI = new GoogleGenAI({ apiKey: API_KEY });
};

export const getGenAI = (): GoogleGenAI => {
  if (!genAI) {
    initGemini();
  }
  return genAI!;
};

// Convert attachment to Gemini Part
export const attachmentToPart = (att: AttachmentPayload): Part => {
  return {
    inlineData: {
      mimeType: att.mime,
      data: att.base64,
    },
  };
};

// Build content array for Gemini
export const buildContents = (
  systemPrompt: string,
  userText: string,
  attachments: AttachmentPayload[],
  conversation: ConversationTurn[] = [],
  userTimeContext?: UserTimeContext,
  currentUserMessageId?: string,
): Content[] => {
  const parts: Part[] = [];
  const attachmentManifest =
    attachments.length === 0
      ? "No attachments were provided in this run."
      : attachments
          .map(
            (att, idx) =>
              `${idx + 1}. attachment_id=${att.attachment_id}, type=${att.type}, mime=${att.mime}`,
          )
          .join("\n");

  // Add text first
  if (userText) {
    parts.push({ text: userText });
  }

  if (userTimeContext) {
    parts.push({
      text:
        "User device current time context for this run:\n" +
        `- epoch_ms: ${userTimeContext.epoch_ms}\n` +
        `- local_iso: ${userTimeContext.local_iso}\n` +
        `- timezone: ${userTimeContext.timezone}\n` +
        `- utc_offset_minutes: ${userTimeContext.utc_offset_minutes}\n` +
        "Use this as the user's local 'now' when resolving relative time phrases like today, tomorrow, and this evening.",
    });
  }

  if (currentUserMessageId && currentUserMessageId.trim().length > 0) {
    parts.push({
      text:
        "Current run message context:\n" +
        `- current_user_message_id: ${currentUserMessageId}\n` +
        "For store_memory_item calls derived from this user turn or this turn's attachments, set source_message_id to current_user_message_id.",
    });
  }

  // Provide explicit attachment IDs so tool calls can reference valid rows.
  parts.push({
    text:
      "Attachment context for tool calls:\n" +
      `${attachmentManifest}\n` +
      "When calling tools, never invent attachment_id values. Use only IDs listed above.",
  });

  // Add media parts
  for (const att of attachments) {
    parts.push(attachmentToPart(att));
  }

  const conversationContents: Content[] = [];
  for (const turn of conversation) {
    const text = turn.text.trim();
    if (!text) continue;
    conversationContents.push({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }

  return [
    { role: "user", parts: [{ text: systemPrompt }] },
    {
      role: "model",
      parts: [{ text: "Understood. I will follow these instructions." }],
    },
    ...conversationContents,
    { role: "user", parts },
  ];
};

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  created_at?: number;
}

// Stream generation with tool support
export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

const extractTextFromChunk = (chunk: unknown): string => {
  if (!chunk || typeof chunk !== "object") return "";

  const directText = (chunk as { text?: unknown }).text;
  if (typeof directText === "string" && directText.length > 0) {
    return directText;
  }

  const candidates = (chunk as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";

  const textParts: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) {
        textParts.push(text);
      }
    }
  }

  return textParts.join("");
};

interface FunctionCallLike {
  name?: string;
  args?: unknown;
}

const extractFunctionCallPartsFromChunk = (chunk: unknown): Part[] => {
  if (!chunk || typeof chunk !== "object") return [];

  const candidates = (chunk as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];

  const partsOut: Part[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if ("functionCall" in (part as Record<string, unknown>)) {
        partsOut.push(part as Part);
      }
    }
  }

  return partsOut;
};

const buildToolCallSummaryText = (calls: FunctionCallLike[]): string => {
  const summaries = calls
    .filter((fc) => typeof fc.name === "string" && fc.name.length > 0)
    .map((fc) => {
      const args =
        fc.args && typeof fc.args === "object"
          ? JSON.stringify(fc.args)
          : "{}";
      return `${fc.name}(${args})`;
    });

  if (summaries.length === 0) {
    return "Model requested one or more tool calls.";
  }

  return `Model requested tool calls: ${summaries.join(", ")}.`;
};

const extractFunctionCallsFromChunk = (chunk: unknown): FunctionCallLike[] => {
  if (!chunk || typeof chunk !== "object") return [];

  const directCalls = (chunk as { functionCalls?: unknown }).functionCalls;
  if (Array.isArray(directCalls) && directCalls.length > 0) {
    return directCalls as FunctionCallLike[];
  }

  const candidates = (chunk as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];

  const calls: FunctionCallLike[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const functionCall = (part as { functionCall?: unknown }).functionCall;
      if (!functionCall || typeof functionCall !== "object") continue;
      calls.push(functionCall as FunctionCallLike);
    }
  }

  return calls;
};

const normalizeFunctionResponse = (result: unknown): Record<string, unknown> => {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { value: result };
};

export const streamGeneration = async (
  contents: Content[],
  callbacks: StreamCallbacks,
): Promise<void> => {
  const ai = getGenAI();
  const toolDefs = getToolDefinitions();

  try {
    let history = contents.slice(0, -1);
    let currentMessage = contents[contents.length - 1];
    let fullText = "";
    let toolIterations = 0;
    let toolUsageDisabled = false;

    while (true) {
      const response = await ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: [...history, currentMessage],
        config:
          !toolUsageDisabled && toolDefs.length > 0
            ? {
                tools: [{ functionDeclarations: toolDefs }],
              }
            : undefined,
      });

      let functionResponsesForTurn: Part[] | null = null;
      let forceFinalAnswerTurn = false;
      const modelTurnParts: Part[] = [];

      for await (const chunk of response) {
        const text = extractTextFromChunk(chunk);
        if (text) {
          fullText += text;
          callbacks.onToken(text);
          modelTurnParts.push({ text });
        }

        // Check for function calls
        const functionCalls = extractFunctionCallsFromChunk(chunk);
        if (functionCalls && functionCalls.length > 0) {
          toolIterations++;
          if (toolIterations > MAX_TOOL_ITERATIONS) {
            toolUsageDisabled = true;
            forceFinalAnswerTurn = true;
            break;
          }

          const rawFunctionCallParts = extractFunctionCallPartsFromChunk(chunk);
          if (rawFunctionCallParts.length > 0) {
            modelTurnParts.push(...rawFunctionCallParts);
          } else {
            modelTurnParts.push({
              text: buildToolCallSummaryText(functionCalls),
            });
          }

          // Process each function call
          const functionResponses: Part[] = [];

          for (const fc of functionCalls) {
            if (!fc.name || typeof fc.name !== "string") {
              continue;
            }
            try {
              const result = await callbacks.onToolCall(
                fc.name,
                fc.args && typeof fc.args === "object"
                  ? (fc.args as Record<string, unknown>)
                  : {},
              );
              functionResponses.push({
                functionResponse: {
                  name: fc.name,
                  response: normalizeFunctionResponse(result),
                },
              });
            } catch (error) {
              functionResponses.push({
                functionResponse: {
                  name: fc.name,
                  response: { error: (error as Error).message },
                },
              });
            }
          }

          functionResponsesForTurn = functionResponses;
          break; // exit inner loop to send function results
        }
      }

      if (forceFinalAnswerTurn) {
        history = [...history, currentMessage];
        if (modelTurnParts.length > 0) {
          history.push({ role: "model", parts: modelTurnParts });
        }
        currentMessage = {
          role: "user",
          parts: [{ text: TOOL_BUDGET_EXHAUSTED_MESSAGE }],
        };
        continue;
      }

      if (!functionResponsesForTurn) {
        break;
      }

      // Continue conversation with function results, preserving all turns so far.
      history = [...history, currentMessage];
      if (modelTurnParts.length > 0) {
        history.push({ role: "model", parts: modelTurnParts });
      }
      currentMessage = { role: "user", parts: functionResponsesForTurn };
    }

    callbacks.onComplete(fullText);
  } catch (error) {
    callbacks.onError(error as Error);
  }
};
