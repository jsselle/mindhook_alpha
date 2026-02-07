import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config/env';
import { readAttachmentAsBase64 } from '../storage/fileManager';
import { AttachmentRow, Citation } from '../types/domain';
import { getActivityLabel, getToolLabel } from '../utils/activityMapping';
import { nowMs } from '../utils/time';
import { generateUUID } from '../utils/uuid';

const PROTOCOL_VERSION = '1.0';
const APP_VERSION = '1.0.0';
const WS_URL = CONFIG.WS_URL;

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
    citations: Citation[];
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

    useEffect(() => {
        return () => {
            const socket = socketRef.current;
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                try {
                    socket.close();
                } catch {
                    // Ignore close errors during teardown
                }
                socketRef.current = null;
            }
        };
    }, []);

    const sendMessage = useCallback(async (
        text: string,
        attachments: AttachmentRow[],
        onToolCall: (payload: ToolCallPayload) => Promise<unknown>
    ): Promise<FinalResponsePayload | null> => {
        setStatus('connecting');
        setError(null);
        setAssistantDraft('');
        setActivityMessage('Connecting...');
        seqRef.current = 0;

        const runId = generateUUID();
        const messageId = generateUUID();

        let attachmentPayloads: Array<Record<string, unknown>> = [];
        try {
            attachmentPayloads = await Promise.all(
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
                        byte_length: att.size_bytes || base64.length * 0.75,
                    };
                })
            );
        } catch (e) {
            const message = (e as Error).message || 'Failed to prepare attachments';
            setStatus('error');
            setError(message);
            setActivityMessage(null);
            throw new Error(message);
        }

        return new Promise((resolve, reject) => {
            let settled = false;

            const settleResolve = (payload: FinalResponsePayload | null) => {
                if (settled) return;
                settled = true;
                resolve(payload);
            };
            const settleReject = (err: Error) => {
                if (settled) return;
                settled = true;
                reject(err);
            };

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
                            setActivityMessage(getActivityLabel(msg.stage));
                            break;

                        case 'assistant_token':
                            setAssistantDraft((prev) => prev + msg.text);
                            break;

                        case 'tool_call':
                            setActivityMessage(getToolLabel(msg.tool));
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
                            settleResolve(msg as FinalResponsePayload);
                            break;

                        case 'run_error':
                            setStatus('error');
                            setError(msg.error.message);
                            setActivityMessage(null);
                            settleReject(new Error(msg.error.message));
                            break;
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                    setStatus('error');
                    setError('Invalid server message');
                    setActivityMessage(null);
                    settleReject(new Error('Invalid server message'));
                }
            };

            socket.onerror = () => {
                setStatus('error');
                setError('Connection error');
                setActivityMessage(null);
                settleReject(new Error('WebSocket error'));
            };

            socket.onclose = () => {
                socketRef.current = null;
                if (!settled) {
                    setStatus('error');
                    setError('Connection closed unexpectedly');
                    setActivityMessage(null);
                    settleReject(new Error('Connection closed unexpectedly'));
                }
            };
        });
    }, []);

    return { status, activityMessage, assistantDraft, error, sendMessage };
};
