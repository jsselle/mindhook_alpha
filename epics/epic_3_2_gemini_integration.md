# Epic 3.2: Gemini API Integration

| Field | Value |
|-------|-------|
| **Epic** | 3.2 |
| **Name** | Gemini API Integration |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 3.1 |
| **Predecessors** | Backend setup, message types |

---

## Overview

Integrate Google's Gemini API for streaming text generation with tool calling support. Create a wrapper that handles media input (base64) and streams responses.

---

## Gemini Client Implementation

**File: `backend_server/src/gemini/client.ts`**

```typescript
import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  FunctionDeclaration,
  Tool,
  GenerateContentStreamResult,
} from '@google/gen-ai';
import { AttachmentPayload } from '../types/messages';
import { getToolDefinitions } from '../tools/definitions';

const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-3-flash-preview';

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

export const initGemini = (): void => {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable required');
  }
  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    tools: [{ functionDeclarations: getToolDefinitions() }],
  });
};

export const getModel = (): GenerativeModel => {
  if (!model) {
    initGemini();
  }
  return model!;
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
  const model = getModel();
  
  try {
    let chat = model.startChat({ history: contents.slice(0, -1) });
    let currentContents = contents[contents.length - 1];
    let fullText = '';
    let continueLoop = true;

    while (continueLoop) {
      const result = await chat.sendMessageStream(currentContents.parts);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullText += text;
          callbacks.onToken(text);
        }

        // Check for function calls
        const functionCalls = chunk.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
          // Process each function call
          const functionResponses: Part[] = [];
          
          for (const fc of functionCalls) {
            try {
              const result = await callbacks.onToolCall(fc.name, fc.args as Record<string, unknown>);
              functionResponses.push({
                functionResponse: {
                  name: fc.name,
                  response: { result },
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

          // Continue conversation with function results
          currentContents = { role: 'user', parts: functionResponses };
          break; // exit inner loop to send function results
        }
      }

      // Check if we got a finish reason indicating completion
      const response = await result.response;
      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === 'STOP' || !candidate?.content?.parts?.some(p => 'functionCall' in p)) {
        continueLoop = false;
      }
    }

    callbacks.onComplete(fullText);
  } catch (error) {
    callbacks.onError(error as Error);
  }
};
```

---

## System Prompt

**File: `backend_server/src/gemini/systemPrompt.ts`**

```typescript
export const SYSTEM_PROMPT = `You are a helpful AI assistant with access to the user's device for storing and retrieving information.

## Core Behaviors

1. **Memory Queries**: When user asks about stored information (locations, prior notes, habits, events), you MUST:
   - Call \`search_memory\` first
   - If no results, call \`search_attachments\` with relevant entities
   - Use \`get_attachment_bundle\` to get full context before answering

2. **Ingestion**: When user provides media (audio, images), you MUST:
   - Generate a transcript (for audio)
   - Extract entities and scenes (for images)
   - Store metadata using \`store_attachment_metadata\`
   - Index entities using \`index_entity\`
   - Store durable facts using \`store_memory_item\` if confidence >= 0.7

3. **Citations**: Always reference your sources. Include attachment IDs or message IDs when citing evidence.

## Tool Usage Rules

- Always include \`schema_version: "1"\` in tool calls
- Generate UUIDs for new records
- Use Unix epoch milliseconds for timestamps
- Memory types: object_location, habit, event, fact
- Metadata kinds: transcript, scene, entities, summary, claims

## Response Format

Be conversational but precise. When referencing stored information, mention the source:
- "Based on your voice note from [date]..."
- "I found a photo showing..."
- "You mentioned previously that..."
`;

// Additional prompt sections are defined in Epic 6 (INGESTION_PROMPT_SECTION)
// and Epic 7 (RETRIEVAL_PROMPT_SECTION). They are combined as follows:

import { INGESTION_PROMPT_SECTION } from './ingestionPrompt';
import { RETRIEVAL_PROMPT_SECTION } from './retrievalPrompt';

export const getFullSystemPrompt = (): string => {
  return [
    SYSTEM_PROMPT,
    INGESTION_PROMPT_SECTION,
    RETRIEVAL_PROMPT_SECTION,
  ].join('\n\n');
};
```

---

## Test Specifications

**File: `backend_server/__tests__/gemini.test.ts`**

```typescript
import { buildContents, attachmentToPart } from '../src/gemini/client';

describe('Gemini Client', () => {
  describe('attachmentToPart', () => {
    it('converts attachment to inline data part', () => {
      const att = {
        attachment_id: 'a1',
        type: 'image' as const,
        mime: 'image/jpeg',
        base64: 'abc123==',
        byte_length: 1000,
      };

      const part = attachmentToPart(att);
      
      expect(part.inlineData).toEqual({
        mimeType: 'image/jpeg',
        data: 'abc123==',
      });
    });
  });

  describe('buildContents', () => {
    it('builds content array with system prompt', () => {
      const contents = buildContents(
        'You are a helpful assistant',
        'Hello',
        []
      );

      expect(contents).toHaveLength(3);
      expect(contents[0].role).toBe('user');
      expect(contents[2].parts[0]).toEqual({ text: 'Hello' });
    });

    it('includes attachment parts', () => {
      const contents = buildContents(
        'System',
        'Check this image',
        [{
          attachment_id: 'img1',
          type: 'image',
          mime: 'image/png',
          base64: 'data==',
          byte_length: 500,
        }]
      );

      const userParts = contents[2].parts;
      expect(userParts).toHaveLength(2);
      expect(userParts[1]).toHaveProperty('inlineData');
    });
  });
});
```

---

## Environment Configuration

**File: `backend_server/.env.example`**

```
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

---

## Acceptance Criteria

- [ ] Gemini client initializes with API key
- [ ] Attachments converted to inline data parts
- [ ] System prompt includes all behavior rules
- [ ] Streaming works with token callbacks
- [ ] Tool calls are intercepted and handled
- [ ] Tool results are sent back to model
- [ ] All tests pass

---

## Report Template

Create `reports/epic_3_2_report.md` after completion.
