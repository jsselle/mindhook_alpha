# Epic 3.3: Run Loop State Machine

| Field | Value |
|-------|-------|
| **Epic** | 3.3 |
| **Name** | Run Loop State Machine |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 3.1, 3.2 |
| **Predecessors** | WebSocket server, Gemini client |

---

## Overview

Implement the deterministic run loop state machine that orchestrates WebSocket message flow, Gemini streaming, and tool call relay.

---

## State Machine Definition

```
States:
  WAIT_RUN_START    - Initial state, waiting for run_start message
  PREPARE_MODEL     - Validating input, building Gemini request
  STREAM_OUTPUT     - Streaming assistant tokens
  HANDLE_TOOL_CALL  - Waiting for tool result from device
  FINALIZE          - Sending final_response
  CLOSE             - Terminal state

Transitions:
  WAIT_RUN_START -> PREPARE_MODEL    (on valid run_start)
  WAIT_RUN_START -> CLOSE            (on invalid message)
  PREPARE_MODEL  -> STREAM_OUTPUT    (on Gemini request built)
  STREAM_OUTPUT  -> HANDLE_TOOL_CALL (on tool_call from Gemini)
  STREAM_OUTPUT  -> FINALIZE         (on generation complete)
  HANDLE_TOOL_CALL -> STREAM_OUTPUT  (on tool_result received)
  HANDLE_TOOL_CALL -> CLOSE          (on timeout or error)
  FINALIZE       -> CLOSE            (always)
```

---

## Implementation

**File: `backend_server/src/ws/runManager.ts`**

```typescript
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  PROTOCOL_VERSION,
  RunStartMessage,
  AssistantTokenMessage,
  StatusMessage,
  ToolCallMessage,
  ToolResultMessage,
  ToolErrorMessage,
  FinalResponseMessage,
  RunErrorMessage,
  ERROR_CODES,
} from '../types/messages';
import { validateEnvelope, validateRunStart } from './protocol';
import { buildContents, streamGeneration, StreamCallbacks } from '../gemini/client';
import { SYSTEM_PROMPT } from '../gemini/systemPrompt';

type RunState = 
  | 'WAIT_RUN_START'
  | 'PREPARE_MODEL'
  | 'STREAM_OUTPUT'
  | 'HANDLE_TOOL_CALL'
  | 'FINALIZE'
  | 'CLOSE';

interface PendingToolCall {
  call_id: string;
  tool: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

export class RunManager {
  private socket: WebSocket;
  private state: RunState = 'WAIT_RUN_START';
  private runId: string = '';
  private seq: number = 0;
  private appVersion: string = 'backend-1.0';
  private pendingToolCalls: Map<string, PendingToolCall> = new Map();
  private toolCallCount: number = 0;
  private toolErrorCount: number = 0;
  private fullResponseText: string = '';

  constructor(socket: WebSocket) {
    this.socket = socket;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.socket.on('message', (data) => this.handleMessage(data));
    this.socket.on('close', () => this.cleanup());
    this.socket.on('error', (err) => this.handleError(err));
  }

  private handleMessage(data: unknown): void {
    try {
      const msg = JSON.parse(data.toString());
      const envValidation = validateEnvelope(msg);
      
      if (!envValidation.valid) {
        this.sendError(envValidation.error!.code, envValidation.error!.message, false);
        return;
      }

      switch (msg.type) {
        case 'run_start':
          this.handleRunStart(msg as RunStartMessage);
          break;
        case 'tool_result':
          this.handleToolResult(msg as ToolResultMessage);
          break;
        case 'tool_error':
          this.handleToolError(msg as ToolErrorMessage);
          break;
        default:
          this.sendError(ERROR_CODES.INVALID_MESSAGE, `Unknown message type: ${msg.type}`, false);
      }
    } catch (e) {
      this.sendError(ERROR_CODES.INVALID_MESSAGE, 'Failed to parse message', false);
    }
  }

  private async handleRunStart(msg: RunStartMessage): Promise<void> {
    if (this.state !== 'WAIT_RUN_START') {
      this.sendError(ERROR_CODES.INVALID_MESSAGE, 'Run already started', false);
      return;
    }

    const validation = validateRunStart(msg);
    if (!validation.valid) {
      this.sendError(validation.error!.code, validation.error!.message, false);
      return;
    }

    this.runId = msg.run_id;
    this.state = 'PREPARE_MODEL';
    this.sendStatus('preparing_model', 'Building request...');

    try {
      const contents = buildContents(
        SYSTEM_PROMPT,
        msg.user.text,
        msg.attachments
      );

      this.state = 'STREAM_OUTPUT';
      this.sendStatus('generating', 'Generating response...');

      const callbacks: StreamCallbacks = {
        onToken: (text) => this.sendToken(text),
        onToolCall: (name, args) => this.relayToolCall(name, args),
        onComplete: (fullText) => this.handleComplete(fullText, msg.user.message_id),
        onError: (error) => this.handleStreamError(error),
      };

      await streamGeneration(contents, callbacks);
    } catch (error) {
      this.sendError(ERROR_CODES.MODEL_UPSTREAM_ERROR, (error as Error).message, true);
    }
  }

  private async relayToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.state = 'HANDLE_TOOL_CALL';
    this.toolCallCount++;

    const call_id = uuidv4();
    const timeout_ms = 15000;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingToolCalls.delete(call_id);
        this.toolErrorCount++;
        reject(new Error('Tool call timeout'));
      }, timeout_ms);

      this.pendingToolCalls.set(call_id, {
        call_id,
        tool: name,
        resolve,
        reject,
        timeoutId,
      });

      this.sendToolCall(call_id, name, args, timeout_ms);
    });
  }

  private handleToolResult(msg: ToolResultMessage): void {
    const pending = this.pendingToolCalls.get(msg.call_id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingToolCalls.delete(msg.call_id);
    this.state = 'STREAM_OUTPUT';

    pending.resolve(msg.result.data);
  }

  private handleToolError(msg: ToolErrorMessage): void {
    const pending = this.pendingToolCalls.get(msg.call_id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingToolCalls.delete(msg.call_id);
    this.toolErrorCount++;
    this.state = 'STREAM_OUTPUT';

    pending.reject(new Error(msg.error.message));
  }

  private handleComplete(fullText: string, userMessageId: string): void {
    this.state = 'FINALIZE';
    this.fullResponseText = fullText;

    const finalMsg: FinalResponseMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: 'final_response',
      run_id: this.runId,
      seq: this.nextSeq(),
      message: {
        message_id: uuidv4(),
        role: 'assistant',
        text: fullText,
        created_at: Date.now(),
      },
      citations: [], // TODO: extract from tool calls
      tool_summary: {
        calls: this.toolCallCount,
        errors: this.toolErrorCount,
      },
    };

    this.send(finalMsg);
    this.close();
  }

  private handleStreamError(error: Error): void {
    this.sendError(ERROR_CODES.MODEL_UPSTREAM_ERROR, error.message, true);
  }

  private handleError(error: Error): void {
    console.error('WebSocket error:', error);
    this.cleanup();
  }

  // Message sending helpers
  private nextSeq(): number {
    return ++this.seq;
  }

  private send(msg: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private sendToken(text: string): void {
    const msg: AssistantTokenMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: 'assistant_token',
      run_id: this.runId,
      seq: this.nextSeq(),
      text,
    };
    this.send(msg);
  }

  private sendStatus(stage: string, detail?: string): void {
    const msg: StatusMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: 'status',
      run_id: this.runId,
      seq: this.nextSeq(),
      stage,
      detail,
    };
    this.send(msg);
  }

  private sendToolCall(call_id: string, tool: string, args: Record<string, unknown>, timeout_ms: number): void {
    const msg: ToolCallMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: 'tool_call',
      run_id: this.runId,
      seq: this.nextSeq(),
      call_id,
      tool,
      args,
      expects_result: true,
      timeout_ms,
    };
    this.send(msg);
  }

  private sendError(code: string, message: string, retryable: boolean): void {
    const msg: RunErrorMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: 'run_error',
      run_id: this.runId || 'unknown',
      seq: this.nextSeq(),
      error: { code, message, retryable },
    };
    this.send(msg);
    this.close();
  }

  private close(): void {
    this.state = 'CLOSE';
    this.socket.close();
  }

  private cleanup(): void {
    for (const pending of this.pendingToolCalls.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingToolCalls.clear();
  }
}
```

### WebSocket Handler

**File: `backend_server/src/ws/handler.ts`**

```typescript
import { WebSocket } from 'ws';
import { FastifyRequest } from 'fastify';
import { RunManager } from './runManager';

export const handleConnection = (socket: WebSocket, req: FastifyRequest): void => {
  console.log('New WebSocket connection');
  
  // Each connection gets its own RunManager
  new RunManager(socket);
};
```

---

## Test Specifications

**File: `backend_server/__tests__/runManager.test.ts`**

```typescript
import { RunManager } from '../src/ws/runManager';
import { WebSocket } from 'ws';

// Mock WebSocket
const createMockSocket = () => {
  const handlers: Record<string, Function> = {};
  return {
    readyState: WebSocket.OPEN,
    on: jest.fn((event, handler) => { handlers[event] = handler; }),
    send: jest.fn(),
    close: jest.fn(),
    _trigger: (event: string, data?: unknown) => handlers[event]?.(data),
  } as unknown as WebSocket & { _trigger: Function };
};

describe('RunManager', () => {
  it('rejects invalid protocol version', () => {
    const socket = createMockSocket();
    new RunManager(socket);

    socket._trigger('message', JSON.stringify({
      protocol_version: '2.0',
      type: 'run_start',
      run_id: 'r1',
      seq: 1,
    }));

    expect(socket.send).toHaveBeenCalled();
    const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
    expect(sentMsg.type).toBe('run_error');
    expect(sentMsg.error.code).toBe('UNSUPPORTED_PROTOCOL');
  });

  it('validates run_start payload', () => {
    const socket = createMockSocket();
    new RunManager(socket);

    socket._trigger('message', JSON.stringify({
      protocol_version: '1.0',
      app_version: '1.0',
      type: 'run_start',
      run_id: 'r1',
      seq: 1,
      user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
      attachments: Array(10).fill({
        attachment_id: 'a1',
        type: 'image',
        mime: 'image/jpeg',
        base64: '',
        byte_length: 1000,
      }),
      context: { recent_message_count: 0 },
    }));

    const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
    expect(sentMsg.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
```

---

## Acceptance Criteria

- [ ] State machine transitions correctly through all states
- [ ] Duplicate run_start rejected after first
- [ ] Tool calls relayed to client with timeout
- [ ] Tool results resume generation
- [ ] Tool timeout sends error and closes
- [ ] final_response includes tool summary
- [ ] All tests pass

---

## Report Template

Create `reports/epic_3_3_report.md` after completion.
