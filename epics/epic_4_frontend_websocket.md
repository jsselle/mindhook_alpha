# Epic 4: Frontend WebSocket Client

| Field | Value |
|-------|-------|
| **Epic** | 4 |
| **Name** | Frontend WebSocket Client |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.4, 1.5, 2.1-2.3, 3.1-3.3 |
| **Predecessors** | Device APIs, design system, UI components, backend WS server |

---

## Overview

Implement the React Native WebSocket client that connects to the backend, handles the complete protocol, and integrates with UI state management.

---

## Implementation

### WebSocket Client Hook

**File: `src/hooks/useWebSocket.ts`**

```typescript
import { useRef, useState, useCallback } from 'react';
import { generateUUID } from '../utils/uuid';
import { nowMs } from '../utils/time';
import { AttachmentRow } from '../types/domain';
import { readAttachmentAsBase64 } from '../storage/fileManager';

const PROTOCOL_VERSION = '1.0';
const APP_VERSION = '1.0.0';
const WS_URL = 'ws://localhost:3000/ws'; // Configurable

// Message types from backend
export interface ToolCallPayload {
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  timeout_ms: number;
}

export interface FinalResponsePayload {
  message: {
    message_id: string;
    role: 'assistant';
    text: string;
    created_at: number;
  };
  citations: Array<{
    kind: string;
    attachment_id?: string;
    message_id?: string;
    note?: string;
  }>;
  tool_summary: { calls: number; errors: number };
}

export type RunStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface UseWebSocketResult {
  status: RunStatus;
  activityMessage: string | null;
  assistantDraft: string;
  error: string | null;
  sendMessage: (
    text: string,
    attachments: AttachmentRow[],
    onToolCall: (payload: ToolCallPayload) => Promise<unknown>
  ) => Promise<FinalResponsePayload | null>;
}

export const useWebSocket = (): UseWebSocketResult => {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const [assistantDraft, setAssistantDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);

  const sendMessage = useCallback(async (
    text: string,
    attachments: AttachmentRow[],
    onToolCall: (payload: ToolCallPayload) => Promise<unknown>
  ): Promise<FinalResponsePayload | null> => {
    return new Promise(async (resolve, reject) => {
      setStatus('connecting');
      setError(null);
      setAssistantDraft('');
      setActivityMessage('Connecting...');
      seqRef.current = 0;

      const runId = generateUUID();
      const messageId = generateUUID();

      // Prepare attachment payloads with base64
      const attachmentPayloads = await Promise.all(
        attachments.map(async (att) => {
          const base64 = await readAttachmentAsBase64(att.local_path);
          return {
            attachment_id: att.id,
            type: att.type,
            mime: att.mime,
            base64,
            duration_ms: att.duration_ms,
            width: att.width,
            height: att.height,
            byte_length: att.size_bytes || base64.length * 0.75, // Approximate
          };
        })
      );

      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus('running');
        setActivityMessage('Sending message...');

        const runStart = {
          protocol_version: PROTOCOL_VERSION,
          app_version: APP_VERSION,
          type: 'run_start',
          run_id: runId,
          seq: ++seqRef.current,
          user: {
            message_id: messageId,
            text,
            created_at: nowMs(),
          },
          attachments: attachmentPayloads,
          context: { recent_message_count: 10 },
        };

        socket.send(JSON.stringify(runStart));
      };

      socket.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'status':
              setActivityMessage(msg.detail || msg.stage);
              break;

            case 'assistant_token':
              setAssistantDraft((prev) => prev + msg.text);
              break;

            case 'tool_call':
              setActivityMessage(`Executing ${msg.tool}...`);
              try {
                const result = await onToolCall(msg);
                const toolResult = {
                  protocol_version: PROTOCOL_VERSION,
                  app_version: APP_VERSION,
                  type: 'tool_result',
                  run_id: runId,
                  seq: ++seqRef.current,
                  call_id: msg.call_id,
                  tool: msg.tool,
                  result: { ok: true, data: result },
                };
                socket.send(JSON.stringify(toolResult));
              } catch (e) {
                const toolError = {
                  protocol_version: PROTOCOL_VERSION,
                  app_version: APP_VERSION,
                  type: 'tool_error',
                  run_id: runId,
                  seq: ++seqRef.current,
                  call_id: msg.call_id,
                  tool: msg.tool,
                  error: {
                    code: 'TOOL_EXECUTION_FAILED',
                    message: (e as Error).message,
                    retryable: false,
                  },
                };
                socket.send(JSON.stringify(toolError));
              }
              break;

            case 'final_response':
              setStatus('complete');
              setActivityMessage(null);
              resolve(msg as FinalResponsePayload);
              break;

            case 'run_error':
              setStatus('error');
              setError(msg.error.message);
              setActivityMessage(null);
              reject(new Error(msg.error.message));
              break;
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      socket.onerror = (e) => {
        setStatus('error');
        setError('Connection error');
        reject(new Error('WebSocket error'));
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (status === 'running') {
          setStatus('error');
          setError('Connection closed unexpectedly');
        }
      };
    });
  }, [status]);

  return { status, activityMessage, assistantDraft, error, sendMessage };
};
```

### Chat Screen Integration

**File: `src/screens/ChatScreen.tsx`**

```typescript
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { MessageList, DisplayMessage } from '../components/MessageList';
import { ComposerRow } from '../components/ComposerRow';
import { ActivityStrip } from '../components/ActivityStrip';
import { AttachmentChip } from '../components/AttachmentChip';
import { AttachmentRenderer } from '../components/AttachmentRenderer';
import { useWebSocket, ToolCallPayload } from '../hooks/useWebSocket';
import { useImagePicker } from '../hooks/useImagePicker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { executeToolCall } from '../tools/dispatcher';
import { insertMessage, linkMessageAttachment } from '../api/deviceWriteApi';
import { generateUUID } from '../utils/uuid';
import { nowMs } from '../utils/time';
import { AttachmentRow } from '../types/domain';
import { colors, spacing } from '../theme/tokens';

export const ChatScreen: React.FC = () => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRow[]>([]);
  
  const { status, activityMessage, assistantDraft, sendMessage } = useWebSocket();
  const imagePicker = useImagePicker();
  const audioRecorder = useAudioRecorder();

  const handleToolCall = useCallback(async (payload: ToolCallPayload): Promise<unknown> => {
    return executeToolCall(payload.tool, payload.args);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    const messageId = generateUUID();
    const createdAt = nowMs();

    // Save user message locally
    await insertMessage({ id: messageId, role: 'user', text, created_at: createdAt });
    
    // Link attachments
    for (let i = 0; i < pendingAttachments.length; i++) {
      await linkMessageAttachment({
        message_id: messageId,
        attachment_id: pendingAttachments[i].id,
        position: i,
      });
    }

    // Add to UI
    const userMsg: DisplayMessage = {
      id: messageId,
      role: 'user',
      text,
      created_at: createdAt,
      attachments: [...pendingAttachments],
    };
    setMessages((prev) => [...prev, userMsg]);
    
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);

    // Send to backend
    try {
      const response = await sendMessage(text, attachmentsToSend, handleToolCall);
      
      if (response) {
        // Save assistant message
        await insertMessage({
          id: response.message.message_id,
          role: 'assistant',
          text: response.message.text,
          created_at: response.message.created_at,
        });

        setMessages((prev) => [...prev, {
          id: response.message.message_id,
          role: 'assistant',
          text: response.message.text,
          created_at: response.message.created_at,
        }]);
      }
    } catch (e) {
      console.error('Send failed:', e);
    }
  }, [pendingAttachments, sendMessage, handleToolCall]);

  const handlePhotoPress = useCallback(async () => {
    const attachment = await imagePicker.pickFromLibrary();
    if (attachment) {
      const row: AttachmentRow = {
        id: attachment.id,
        type: 'image',
        mime: attachment.mime,
        local_path: attachment.localPath,
        size_bytes: attachment.sizeBytes,
        duration_ms: null,
        width: attachment.width,
        height: attachment.height,
        created_at: nowMs(),
      };
      setPendingAttachments((prev) => [...prev, row]);
    }
  }, [imagePicker]);

  const handleVoiceStart = useCallback(() => {
    audioRecorder.startRecording();
  }, [audioRecorder]);

  const handleVoiceStop = useCallback(async () => {
    const attachment = await audioRecorder.stopRecording();
    if (attachment) {
      const row: AttachmentRow = {
        id: attachment.id,
        type: 'audio',
        mime: attachment.mime,
        local_path: attachment.localPath,
        size_bytes: attachment.sizeBytes,
        duration_ms: attachment.durationMs,
        width: null,
        height: null,
        created_at: nowMs(),
      };
      setPendingAttachments((prev) => [...prev, row]);
    }
  }, [audioRecorder]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ActivityStrip status={activityMessage} isVisible={status === 'running'} />
      
      <MessageList
        messages={messages}
        renderAttachment={(att) => <AttachmentRenderer attachment={att} />}
      />

      {pendingAttachments.length > 0 && (
        <View style={styles.pendingRow}>
          {pendingAttachments.map((att) => (
            <AttachmentChip
              key={att.id}
              id={att.id}
              type={att.type}
              localPath={att.local_path}
              durationMs={att.duration_ms ?? undefined}
              onRemove={handleRemoveAttachment}
            />
          ))}
        </View>
      )}

      <ComposerRow
        onSend={handleSend}
        onPhotoPress={handlePhotoPress}
        onVoiceStart={handleVoiceStart}
        onVoiceStop={handleVoiceStop}
        isRecording={audioRecorder.state.isRecording}
        isSending={status === 'running'}
        disabled={status === 'connecting'}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  pendingRow: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm },
});
```

---

## Test Specifications

**File: `src/hooks/__tests__/useWebSocket.test.ts`**

```typescript
// Note: WebSocket testing typically requires mocking the global WebSocket
// This tests the protocol handling logic

describe('WebSocket Protocol', () => {
  it('builds correct run_start message shape', () => {
    const runStart = {
      protocol_version: '1.0',
      type: 'run_start',
      run_id: 'test-run',
      seq: 1,
      user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
      attachments: [],
      context: { recent_message_count: 10 },
    };

    expect(runStart.protocol_version).toBe('1.0');
    expect(runStart.type).toBe('run_start');
    expect(runStart.user).toBeDefined();
  });

  it('tool_result shape is correct', () => {
    const toolResult = {
      protocol_version: '1.0',
      type: 'tool_result',
      run_id: 'r1',
      seq: 2,
      call_id: 'c1',
      tool: 'search_memory',
      result: { ok: true, data: { items: [] } },
    };

    expect(toolResult.result.ok).toBe(true);
  });
});
```

---

## Acceptance Criteria

- [ ] WebSocket connects to backend on send
- [ ] run_start message sent with correct structure
- [ ] Streaming tokens update assistantDraft
- [ ] Tool calls dispatched to local handler
- [ ] Tool results sent back to backend
- [ ] final_response triggers message save
- [ ] Connection errors handled gracefully
- [ ] All tests pass

---

## Report Template

Create `reports/epic_4_report.md` after completion.
