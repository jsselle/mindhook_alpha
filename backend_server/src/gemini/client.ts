import {
    Content,
    GoogleGenAI,
    Part
} from '@google/genai';
import { getToolDefinitions } from '../tools/definitions';
import { AttachmentPayload } from '../types/messages';

const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-2.0-flash';

let genAI: GoogleGenAI | null = null;

export const initGemini = (): void => {
    if (!API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable required');
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
    attachments: AttachmentPayload[]
): Content[] => {
    const parts: Part[] = [];

    // Add text first
    if (userText) {
        parts.push({ text: userText });
    }

    // Add media parts
    for (const att of attachments) {
        parts.push(attachmentToPart(att));
    }

    return [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
        { role: 'user', parts },
    ];
};

// Stream generation with tool support
export interface StreamCallbacks {
    onToken: (text: string) => void;
    onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    onComplete: (fullText: string) => void;
    onError: (error: Error) => void;
}

export const streamGeneration = async (
    contents: Content[],
    callbacks: StreamCallbacks
): Promise<void> => {
    const ai = getGenAI();
    const toolDefs = getToolDefinitions();

    try {
        let history = contents.slice(0, -1);
        let currentMessage = contents[contents.length - 1];
        let fullText = '';
        let continueLoop = true;

        while (continueLoop) {
            const response = await ai.models.generateContentStream({
                model: MODEL_NAME,
                contents: [...history, currentMessage],
                config: toolDefs.length > 0 ? {
                    tools: [{ functionDeclarations: toolDefs }],
                } : undefined,
            });

            for await (const chunk of response) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    callbacks.onToken(text);
                }

                // Check for function calls
                const functionCalls = chunk.functionCalls;
                if (functionCalls && functionCalls.length > 0) {
                    // Process each function call
                    const functionResponses: Part[] = [];

                    for (const fc of functionCalls) {
                        try {
                            const result = await callbacks.onToolCall(fc.name!, fc.args as Record<string, unknown>);
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

                    // Update history and continue conversation with function results
                    history = [...history, currentMessage];
                    currentMessage = { role: 'user', parts: functionResponses };
                    break; // exit inner loop to send function results
                }
            }

            // Check if we should continue (no more function calls pending)
            const hasPendingFunctionCalls = currentMessage.parts?.some(p => 'functionResponse' in p);
            if (!hasPendingFunctionCalls) {
                continueLoop = false;
            }
        }

        callbacks.onComplete(fullText);
    } catch (error) {
        callbacks.onError(error as Error);
    }
};
