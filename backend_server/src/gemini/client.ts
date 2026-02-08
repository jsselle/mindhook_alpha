import { type Content, GoogleGenAI, type Part } from "@google/genai";
import { getToolDefinitions } from "../tools/definitions.ts";
import type { AttachmentPayload, UserTimeContext } from "../types/messages.ts";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-3-flash-preview";

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

    while (true) {
      const response = await ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: [...history, currentMessage],
        config:
          toolDefs.length > 0
            ? {
                tools: [{ functionDeclarations: toolDefs }],
              }
            : undefined,
      });

      let functionResponsesForTurn: Part[] | null = null;

      for await (const chunk of response) {
        // Check for function calls
        const functionCalls = chunk.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          // Process each function call
          const functionResponses: Part[] = [];

          for (const fc of functionCalls) {
            try {
              const result = await callbacks.onToolCall(
                fc.name!,
                fc.args as Record<string, unknown>,
              );
              functionResponses.push({
                functionResponse: {
                  name: fc.name!,
                  response: { result },
                },
              });
            } catch (error) {
              functionResponses.push({
                functionResponse: {
                  name: fc.name!,
                  response: { error: (error as Error).message },
                },
              });
            }
          }

          functionResponsesForTurn = functionResponses;
          break; // exit inner loop to send function results
        }

        const text = extractTextFromChunk(chunk);
        if (text) {
          fullText += text;
          callbacks.onToken(text);
        }
      }

      if (!functionResponsesForTurn) {
        break;
      }

      // Continue conversation with function results
      history = [...history, currentMessage];
      currentMessage = { role: "user", parts: functionResponsesForTurn };
    }

    callbacks.onComplete(fullText);
  } catch (error) {
    callbacks.onError(error as Error);
  }
};
