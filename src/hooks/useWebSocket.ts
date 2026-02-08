import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config/env';
import { readAttachmentAsBase64 } from '../storage/fileManager';
import { AttachmentRow, Citation } from '../types/domain';
import { getActivityLabel, getToolLabel } from '../utils/activityMapping';
import { nowMs } from '../utils/time';
import { generateUUID } from '../utils/uuid';
import { classifySocketClose, TerminalOutcome } from './websocketTermination';

const PROTOCOL_VERSION = '1.0';
const APP_VERSION = '1.0.0';
const WS_URL = CONFIG.WS_URL;
const FRIENDLY_SEND_ERROR = 'Message not sent. Please send it again.';
const REMINDER_SCHEDULE_FALLBACK =
    'I saved the reminder but could not schedule the alert. Please reopen the app and I will retry.';

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
    cancelActiveRun: () => void;
    sendMessage: (
        text: string,
        attachments: AttachmentRow[],
        conversation: ConversationMessage[],
        onToolCall: (payload: ToolCallPayload) => Promise<unknown>
    ) => Promise<FinalResponsePayload | null>;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    text: string;
    created_at: number;
}

interface UserTimeContext {
    epoch_ms: number;
    timezone: string;
    utc_offset_minutes: number;
    local_iso: string;
}

const shouldApplyReminderScheduleFallback = (tool: unknown, message: string): boolean => {
    if (tool !== 'create_reminder' && tool !== 'update_reminder') {
        return false;
    }
    return /failed to (re)?schedule reminder/i.test(message);
};

const ensureReminderScheduleFallbackText = (text: string): string => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return REMINDER_SCHEDULE_FALLBACK;
    if (trimmed.includes(REMINDER_SCHEDULE_FALLBACK)) return trimmed;
    return `${trimmed} ${REMINDER_SCHEDULE_FALLBACK}`;
};

const toLocalIsoWithOffset = (date: Date): string => {
    const pad = (n: number): string => String(Math.trunc(Math.abs(n))).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const millis = String(date.getMilliseconds()).padStart(3, '0');
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
    const offsetRemainderMinutes = pad(Math.abs(offsetMinutes) % 60);

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetRemainderMinutes}`;
};

const getUserTimeContext = (): UserTimeContext => {
    const now = new Date();
    return {
        epoch_ms: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        utc_offset_minutes: -now.getTimezoneOffset(),
        local_iso: toLocalIsoWithOffset(now),
    };
};

interface QueuedMessage {
    text: string;
    attachments: AttachmentRow[];
    conversation: ConversationMessage[];
    onToolCall: (payload: ToolCallPayload) => Promise<unknown>;
    resolve: (payload: FinalResponsePayload | null) => void;
    reject: (error: Error) => void;
}

export const useWebSocket = (): UseWebSocketResult => {
    const [status, setStatus] = useState<RunStatus>('idle');
    const [activityMessage, setActivityMessage] = useState<string | null>(null);
    const [assistantDraft, setAssistantDraft] = useState('');
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const activeRunCancelRef = useRef<(() => void) | null>(null);
    const seqRef = useRef(0);
    const queueRef = useRef<QueuedMessage[]>([]);
    const isProcessingRef = useRef(false);

    const cancelActiveRun = useCallback(() => {
        const activeCancel = activeRunCancelRef.current;
        if (activeCancel) {
            activeCancel();
        }

        for (const queued of queueRef.current) {
            queued.reject(new Error('Message cancelled by user'));
        }
        queueRef.current = [];

        setStatus('idle');
        setActivityMessage(null);
        setAssistantDraft('');
        setError(null);
    }, []);

    useEffect(() => {
        return () => {
            cancelActiveRun();
        };
    }, [cancelActiveRun]);

    const processQueue = useCallback(async (): Promise<void> => {
        if (isProcessingRef.current) return;

        isProcessingRef.current = true;
        try {
            while (queueRef.current.length > 0) {
                const next = queueRef.current.shift();
                if (!next) break;

                setStatus('connecting');
                setError(null);
                setAssistantDraft('');
                setActivityMessage('Preparing...');
                seqRef.current = 0;

                const runId = generateUUID();
                const messageId = generateUUID();

                let attachmentPayloads: Array<Record<string, unknown>> = [];
                try {
                    attachmentPayloads = await Promise.all(
                        next.attachments.map(async (att) => {
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
                    setError(FRIENDLY_SEND_ERROR);
                    setActivityMessage(null);
                    next.reject(new Error(message));
                    continue;
                }

                await new Promise<void>((done) => {
                    let settled = false;
                    let terminalOutcome: TerminalOutcome = 'none';
                    let cancelledByUser = false;
                    let needsReminderScheduleFallback = false;

                    const settleResolve = (payload: FinalResponsePayload | null) => {
                        if (settled) return;
                        settled = true;
                        activeRunCancelRef.current = null;
                        next.resolve(payload);
                        done();
                    };
                    const settleReject = (err: Error) => {
                        if (settled) return;
                        settled = true;
                        activeRunCancelRef.current = null;
                        next.reject(err);
                        done();
                    };

                    const socket = new WebSocket(WS_URL);
                    socketRef.current = socket;
                    activeRunCancelRef.current = () => {
                        if (settled) return;
                        cancelledByUser = true;
                        settleReject(new Error('Message cancelled by user'));
                        socket.onopen = null;
                        socket.onmessage = null;
                        socket.onerror = null;
                        socket.onclose = null;
                        try {
                            socket.close(1000, 'user_cancelled');
                        } catch {
                            // Ignore close errors for user cancellation
                        }
                        if (socketRef.current === socket) {
                            socketRef.current = null;
                        }
                    };

                    socket.onopen = () => {
                        if (cancelledByUser || settled) {
                            return;
                        }
                        setStatus('running');
                        setActivityMessage('Preparing...');
                        const userTime = getUserTimeContext();

                        const runStart = {
                            protocol_version: PROTOCOL_VERSION,
                            app_version: APP_VERSION,
                            type: 'run_start',
                            run_id: runId,
                            seq: ++seqRef.current,
                            user: {
                                message_id: messageId,
                                text: next.text,
                                created_at: nowMs(),
                            },
                            attachments: attachmentPayloads,
                            context: {
                                recent_message_count: 10,
                                messages: next.conversation,
                                user_time: userTime,
                            },
                        };

                        socket.send(JSON.stringify(runStart));
                    };

                    socket.onmessage = async (event) => {
                        if (cancelledByUser || settled) {
                            return;
                        }
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
                                        const result = await next.onToolCall(msg);
                                        if (cancelledByUser || settled || socket.readyState !== WebSocket.OPEN) {
                                            return;
                                        }
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
                                        if (cancelledByUser || settled || socket.readyState !== WebSocket.OPEN) {
                                            return;
                                        }
                                        const errorMessage = (e as Error).message;
                                        if (shouldApplyReminderScheduleFallback(msg.tool, errorMessage)) {
                                            needsReminderScheduleFallback = true;
                                        }
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
                                                message: errorMessage,
                                                retryable: false,
                                            },
                                        };
                                        socket.send(JSON.stringify(toolError));
                                    }
                                    break;

                                case 'final_response':
                                    terminalOutcome = 'complete';
                                    setStatus('complete');
                                    setActivityMessage(null);
                                    if (needsReminderScheduleFallback) {
                                        const payload = msg as FinalResponsePayload;
                                        settleResolve({
                                            ...payload,
                                            message: {
                                                ...payload.message,
                                                text: ensureReminderScheduleFallbackText(payload.message?.text ?? ''),
                                            },
                                        });
                                    } else {
                                        settleResolve(msg as FinalResponsePayload);
                                    }
                                    break;

                                case 'run_error':
                                    terminalOutcome = 'error';
                                    setStatus('error');
                                    setError(FRIENDLY_SEND_ERROR);
                                    setActivityMessage(null);
                                    settleReject(new Error(msg.error.message));
                                    break;
                            }
                        } catch (e) {
                            console.error('Failed to parse message:', e);
                            terminalOutcome = 'error';
                            setStatus('error');
                            setError(FRIENDLY_SEND_ERROR);
                            setActivityMessage(null);
                            settleReject(new Error('Invalid server message'));
                        }
                    };

                    socket.onerror = () => {
                        if (cancelledByUser) {
                            return;
                        }
                        if (settled || terminalOutcome !== 'none') {
                            return;
                        }
                        terminalOutcome = 'error';
                        setStatus('error');
                        setError(FRIENDLY_SEND_ERROR);
                        setActivityMessage(null);
                        settleReject(new Error('WebSocket error'));
                    };

                    socket.onclose = (event) => {
                        socketRef.current = null;
                        activeRunCancelRef.current = null;
                        if (cancelledByUser) {
                            return;
                        }
                        const classification = classifySocketClose({
                            settled,
                            terminalOutcome,
                            closeReason: typeof event?.reason === 'string' ? event.reason : '',
                        });

                        if (classification === 'ignore') {
                            return;
                        }

                        const closeCode = typeof event?.code === 'number' ? event.code : undefined;
                        if (classification === 'run_error' || classification === 'protocol_error') {
                            terminalOutcome = 'error';
                            const message = classification === 'run_error'
                                ? 'Run failed before response completed'
                                : 'Run completed without final response';
                            setStatus('error');
                            setError(FRIENDLY_SEND_ERROR);
                            setActivityMessage(null);
                            settleReject(new Error(message));
                            return;
                        }

                        terminalOutcome = 'error';
                        const closeLabel = closeCode ? ` (code ${closeCode})` : '';
                        setStatus('error');
                        setError(FRIENDLY_SEND_ERROR);
                        setActivityMessage(null);
                        settleReject(new Error(`Connection closed unexpectedly${closeLabel}`));
                    };
                });
            }
        } finally {
            isProcessingRef.current = false;
            activeRunCancelRef.current = null;
            if (queueRef.current.length === 0) {
                setStatus((prev) => (prev === 'error' ? prev : 'idle'));
                setActivityMessage(null);
            }
        }
    }, []);

    const sendMessage = useCallback(async (
        text: string,
        attachments: AttachmentRow[],
        conversation: ConversationMessage[],
        onToolCall: (payload: ToolCallPayload) => Promise<unknown>
    ): Promise<FinalResponsePayload | null> => {
        return new Promise<FinalResponsePayload | null>((resolve, reject) => {
            queueRef.current.push({ text, attachments, conversation, onToolCall, resolve, reject });

            if (isProcessingRef.current) {
                setActivityMessage(`Queued (${queueRef.current.length})`);
            }

            void processQueue();
        });
    }, [processQueue]);

    return { status, activityMessage, assistantDraft, error, cancelActiveRun, sendMessage };
};
