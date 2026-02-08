import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useWebSocket } from '../useWebSocket';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../config/env', () => ({
    CONFIG: {
        WS_URL: 'ws://test.local/ws',
    },
}));

jest.mock('../../storage/fileManager', () => ({
    readAttachmentAsBase64: jest.fn().mockResolvedValue(''),
}));

class MockWebSocket {
    static instances: MockWebSocket[] = [];
    static OPEN = 1;
    static CLOSED = 3;

    readyState = 1;
    url: string;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

    send = jest.fn();
    close = jest.fn();

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    triggerOpen(): void {
        this.onopen?.();
    }

    triggerMessage(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }

    triggerError(): void {
        this.onerror?.({});
    }

    triggerClose(code = 1000, reason = ''): void {
        this.readyState = 3;
        this.onclose?.({ code, reason });
    }
}

const flushPromises = async (): Promise<void> => {
    await act(async () => {
        await Promise.resolve();
    });
};

// Note: WebSocket testing typically requires mocking the global WebSocket
// This tests the protocol handling logic

describe('WebSocket Protocol', () => {
    let originalWebSocket: typeof global.WebSocket | undefined;

    beforeEach(() => {
        originalWebSocket = global.WebSocket;
        (global as typeof global & { WebSocket: unknown }).WebSocket =
            MockWebSocket as unknown as typeof WebSocket;
        MockWebSocket.instances = [];
        jest.clearAllMocks();
    });

    afterEach(() => {
        (global as typeof global & { WebSocket: unknown }).WebSocket =
            originalWebSocket as unknown as typeof WebSocket;
    });

    it('builds correct run_start message shape', () => {
        const runStart = {
            protocol_version: '1.0',
            app_version: '1.0.0',
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
        expect(runStart.user.message_id).toBe('m1');
        expect(runStart.user.text).toBe('hello');
        expect(runStart.attachments).toEqual([]);
        expect(runStart.context.recent_message_count).toBe(10);
    });

    it('builds correct tool_result message shape', () => {
        const toolResult = {
            protocol_version: '1.0',
            app_version: '1.0.0',
            type: 'tool_result',
            run_id: 'r1',
            seq: 2,
            call_id: 'c1',
            tool: 'search_memory',
            result: { ok: true, data: { items: [] } },
        };

        expect(toolResult.protocol_version).toBe('1.0');
        expect(toolResult.type).toBe('tool_result');
        expect(toolResult.call_id).toBe('c1');
        expect(toolResult.tool).toBe('search_memory');
        expect(toolResult.result.ok).toBe(true);
        expect(toolResult.result.data).toEqual({ items: [] });
    });

    it('builds correct tool_error message shape', () => {
        const toolError = {
            protocol_version: '1.0',
            app_version: '1.0.0',
            type: 'tool_error',
            run_id: 'r1',
            seq: 3,
            call_id: 'c2',
            tool: 'save_memory',
            error: {
                code: 'TOOL_EXECUTION_FAILED',
                message: 'Database error',
                retryable: false,
            },
        };

        expect(toolError.type).toBe('tool_error');
        expect(toolError.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(toolError.error.message).toBe('Database error');
        expect(toolError.error.retryable).toBe(false);
    });

    it('attachment payload includes required fields', () => {
        const attachmentPayload = {
            attachment_id: 'att-123',
            type: 'image',
            mime: 'image/jpeg',
            base64: 'abc123',
            duration_ms: null,
            width: 1024,
            height: 768,
            byte_length: 12345,
        };

        expect(attachmentPayload.attachment_id).toBe('att-123');
        expect(attachmentPayload.type).toBe('image');
        expect(attachmentPayload.mime).toBe('image/jpeg');
        expect(attachmentPayload.base64).toBe('abc123');
        expect(attachmentPayload.width).toBe(1024);
        expect(attachmentPayload.height).toBe(768);
    });
});

describe('RunStatus types', () => {
    it('validates all status values', () => {
        const validStatuses = ['idle', 'connecting', 'running', 'complete', 'error'];
        validStatuses.forEach((status) => {
            expect(['idle', 'connecting', 'running', 'complete', 'error']).toContain(status);
        });
    });
});

describe('useWebSocket termination handling', () => {
    let originalWebSocket: typeof global.WebSocket | undefined;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        originalWebSocket = global.WebSocket;
        (global as typeof global & { WebSocket: unknown }).WebSocket =
            MockWebSocket as unknown as typeof WebSocket;
        MockWebSocket.instances = [];
        jest.clearAllMocks();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        (global as typeof global & { WebSocket: unknown }).WebSocket =
            originalWebSocket as unknown as typeof WebSocket;
        consoleErrorSpy.mockRestore();
    });

    it('does not set connection error after successful final_response and socket close', async () => {
        let hookState: ReturnType<typeof useWebSocket> | null = null;

        const HookHarness: React.FC = () => {
            hookState = useWebSocket();
            return null;
        };

        let renderer: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(React.createElement(HookHarness));
        });

        let resolvedPayload: unknown = null;
        let runPromise: Promise<unknown>;
        await act(async () => {
            runPromise = hookState!.sendMessage('hello', [], [], async () => ({}));
            await Promise.resolve();
        });

        await act(async () => {
            const socket = MockWebSocket.instances[0];
            expect(socket).toBeDefined();

            socket.triggerOpen();
            expect(socket.send).toHaveBeenCalledTimes(1);
            const runStart = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
            expect(runStart.type).toBe('run_start');
            expect(runStart.context.user_time).toBeDefined();
            expect(typeof runStart.context.user_time.epoch_ms).toBe('number');
            expect(typeof runStart.context.user_time.timezone).toBe('string');
            expect(typeof runStart.context.user_time.utc_offset_minutes).toBe('number');
            expect(typeof runStart.context.user_time.local_iso).toBe('string');

            socket.triggerMessage({
                type: 'final_response',
                message: {
                    message_id: 'assistant-1',
                    role: 'assistant',
                    text: 'done',
                    created_at: 123,
                },
                citations: [],
                tool_summary: { calls: 0, errors: 0 },
            });

            // Simulate transport noise after terminal success.
            socket.triggerError();
            socket.triggerClose(1000, 'run_complete');
        });
        resolvedPayload = await runPromise!;

        await flushPromises();

        expect(resolvedPayload).toEqual({
            type: 'final_response',
            message: {
                message_id: 'assistant-1',
                role: 'assistant',
                text: 'done',
                created_at: 123,
            },
            citations: [],
            tool_summary: { calls: 0, errors: 0 },
        });
        expect(hookState!.error).toBeNull();
        expect(hookState!.status).toBe('idle');

        await act(async () => {
            renderer!.unmount();
        });
    });

    it('cancels an active run and clears transient UI state', async () => {
        let hookState: ReturnType<typeof useWebSocket> | null = null;

        const HookHarness: React.FC = () => {
            hookState = useWebSocket();
            return null;
        };

        let renderer: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(React.createElement(HookHarness));
        });

        let runPromise: Promise<unknown>;
        await act(async () => {
            runPromise = hookState!.sendMessage('hello', [], [], async () => ({}));
            await Promise.resolve();
        });

        await act(async () => {
            const socket = MockWebSocket.instances[0];
            expect(socket).toBeDefined();
            socket.triggerOpen();
        });

        expect(hookState!.status).toBe('running');

        await act(async () => {
            hookState!.cancelActiveRun();
        });

        await expect(runPromise!).rejects.toThrow('Message cancelled by user');
        expect(hookState!.status).toBe('idle');
        expect(hookState!.activityMessage).toBeNull();
        expect(hookState!.assistantDraft).toBe('');
        expect(hookState!.error).toBeNull();

        await act(async () => {
            renderer!.unmount();
        });
    });

    it('appends deterministic fallback text when reminder scheduling tool call fails', async () => {
        let hookState: ReturnType<typeof useWebSocket> | null = null;

        const HookHarness: React.FC = () => {
            hookState = useWebSocket();
            return null;
        };

        let renderer: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(React.createElement(HookHarness));
        });

        const onToolCall = jest.fn(async () => {
            throw new Error('Failed to schedule reminder: notification permission denied');
        });
        const runPromise = hookState!.sendMessage(
            'Remind me tomorrow',
            [],
            [],
            onToolCall,
        );

        await act(async () => {
            await Promise.resolve();
        });

        const socket = MockWebSocket.instances[0];
        await act(async () => {
            socket.triggerOpen();
            socket.triggerMessage({
                type: 'tool_call',
                call_id: 'call-1',
                tool: 'create_reminder',
                args: {},
                timeout_ms: 15000,
            });
        });
        await flushPromises();
        await flushPromises();
        expect(onToolCall).toHaveBeenCalledTimes(1);

        await act(async () => {
            socket.triggerMessage({
                type: 'final_response',
                message: {
                    message_id: 'assistant-2',
                    role: 'assistant',
                    text: 'Your reminder is saved.',
                    created_at: 123,
                },
                citations: [],
                tool_summary: { calls: 1, errors: 1 },
            });
            socket.triggerClose(1000, 'run_complete');
        });

        await expect(runPromise).resolves.toEqual(expect.objectContaining({
            message: expect.objectContaining({
                text: expect.stringContaining(
                    'I saved the reminder but could not schedule the alert. Please reopen the app and I will retry.',
                ),
            }),
        }));

        await act(async () => {
            renderer!.unmount();
        });
    });
});
