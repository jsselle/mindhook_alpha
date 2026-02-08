import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../src/types/messages';
import { RunManager } from '../src/ws/runManager';

// Mock uuid first to prevent ESM import issues
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'test-uuid-1234'),
}));

// Mock dependencies
jest.mock('../src/gemini/client', () => ({
    buildContents: jest.fn(() => []),
    streamGeneration: jest.fn(),
}));

jest.mock('../src/gemini/systemPrompt', () => ({
    SYSTEM_PROMPT: 'Test system prompt',
    getFullSystemPrompt: jest.fn(() => 'Test system prompt'),
}));

// Mock WebSocket
const createMockSocket = () => {
    const handlers: Record<string, Function> = {};
    return {
        readyState: WebSocket.OPEN,
        on: jest.fn((event, handler) => {
            handlers[event] = handler;
        }),
        send: jest.fn(),
        close: jest.fn(),
        _trigger: (event: string, data?: unknown) => handlers[event]?.(data),
    } as unknown as WebSocket & { _trigger: Function };
};

describe('RunManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects invalid protocol version', () => {
        const socket = createMockSocket();
        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: '2.0',
            app_version: '1.0',
            type: 'run_start',
            run_id: 'r1',
            seq: 1,
        }));

        expect(socket.send).toHaveBeenCalled();
        const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
        expect(sentMsg.type).toBe('run_error');
        expect(sentMsg.error.code).toBe('UNSUPPORTED_PROTOCOL');
        expect(socket.close).toHaveBeenCalledWith(1011, 'run_error');
    });

    it('validates run_start payload - too many attachments', () => {
        const socket = createMockSocket();
        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
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

        expect(socket.send).toHaveBeenCalled();
        const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
        expect(sentMsg.type).toBe('run_error');
        expect(sentMsg.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects duplicate run_start', async () => {
        const socket = createMockSocket();
        const { streamGeneration } = require('../src/gemini/client');

        // Make streamGeneration wait indefinitely
        streamGeneration.mockImplementation(() => new Promise(() => { }));

        new RunManager(socket);

        const validRunStart = JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
            app_version: '1.0',
            type: 'run_start',
            run_id: 'r1',
            seq: 1,
            user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
            attachments: [],
            context: { recent_message_count: 0 },
        });

        // First run_start should be accepted
        socket._trigger('message', validRunStart);

        // Wait a tick for async processing
        await new Promise(resolve => setImmediate(resolve));

        // Clear previous sends
        (socket.send as jest.Mock).mockClear();

        // Second run_start should be rejected
        socket._trigger('message', validRunStart);

        expect(socket.send).toHaveBeenCalled();
        const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
        expect(sentMsg.type).toBe('run_error');
        expect(sentMsg.error.message).toBe('Run already started');
    });

    it('rejects invalid JSON', () => {
        const socket = createMockSocket();
        new RunManager(socket);

        socket._trigger('message', 'not valid json');

        expect(socket.send).toHaveBeenCalled();
        const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
        expect(sentMsg.type).toBe('run_error');
        expect(sentMsg.error.code).toBe('INVALID_MESSAGE');
    });

    it('rejects unknown message type', () => {
        const socket = createMockSocket();
        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
            app_version: '1.0',
            type: 'unknown_type',
            run_id: 'r1',
            seq: 1,
        }));

        expect(socket.send).toHaveBeenCalled();
        const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
        expect(sentMsg.type).toBe('run_error');
        expect(sentMsg.error.code).toBe('INVALID_MESSAGE');
    });

    it('sends status updates when run starts', async () => {
        const socket = createMockSocket();
        const { streamGeneration } = require('../src/gemini/client');

        // Make streamGeneration complete immediately
        streamGeneration.mockImplementation(async (_: unknown, callbacks: { onComplete: (text: string) => void }) => {
            callbacks.onComplete('Test response');
        });

        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
            app_version: '1.0',
            type: 'run_start',
            run_id: 'r1',
            seq: 1,
            user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
            attachments: [],
            context: { recent_message_count: 0 },
        }));

        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));

        const calls = (socket.send as jest.Mock).mock.calls;
        expect(calls.length).toBeGreaterThan(0);

        // First message should be status
        const firstMsg = JSON.parse(calls[0][0]);
        expect(firstMsg.type).toBe('status');
        expect(firstMsg.stage).toBe('preparing_model');
    });

    it('sends final_response with tool_summary on completion', async () => {
        const socket = createMockSocket();
        const { streamGeneration } = require('../src/gemini/client');

        streamGeneration.mockImplementation(async (_: unknown, callbacks: { onComplete: (text: string) => void }) => {
            callbacks.onComplete('Final response text');
        });

        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
            app_version: '1.0',
            type: 'run_start',
            run_id: 'r1',
            seq: 1,
            user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
            attachments: [],
            context: { recent_message_count: 0 },
        }));

        // Wait for async processing
        await new Promise(resolve => setImmediate(resolve));

        const calls = (socket.send as jest.Mock).mock.calls;
        const finalMsg = JSON.parse(calls[calls.length - 1][0]);

        expect(finalMsg.type).toBe('final_response');
        expect(finalMsg.message.text).toBe('Final response text');
        expect(finalMsg.tool_summary).toEqual({ calls: 0, errors: 0 });
        expect(socket.close).toHaveBeenCalledWith(1000, 'run_complete');
    });

    it('enforces a non-empty final assistant message when model output is blank', async () => {
        const socket = createMockSocket();
        const { streamGeneration } = require('../src/gemini/client');

        streamGeneration.mockImplementation(async (_: unknown, callbacks: { onComplete: (text: string) => void }) => {
            callbacks.onComplete('   ');
        });

        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
            app_version: '1.0',
            type: 'run_start',
            run_id: 'r1',
            seq: 1,
            user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
            attachments: [],
            context: { recent_message_count: 0 },
        }));

        await new Promise(resolve => setImmediate(resolve));

        const outbound = (socket.send as jest.Mock).mock.calls.map(call => JSON.parse(call[0]));
        const tokenMsg = outbound.find(msg => msg.type === 'assistant_token');
        const finalMsg = outbound.find(msg => msg.type === 'final_response');

        expect(tokenMsg).toBeDefined();
        expect(typeof tokenMsg.text).toBe('string');
        expect(tokenMsg.text.trim().length).toBeGreaterThan(0);

        expect(finalMsg).toBeDefined();
        expect(typeof finalMsg.message.text).toBe('string');
        expect(finalMsg.message.text.trim().length).toBeGreaterThan(0);
    });

    it('cleans up pending tool calls on connection close', () => {
        const socket = createMockSocket();
        new RunManager(socket);

        // Trigger close event
        socket._trigger('close');

        // Should not throw
        expect(socket.close).not.toHaveBeenCalled(); // close initiated by other side
    });

    it('validates unsupported MIME types', () => {
        const socket = createMockSocket();
        new RunManager(socket);

        socket._trigger('message', JSON.stringify({
            protocol_version: PROTOCOL_VERSION,
            app_version: '1.0',
            type: 'run_start',
            run_id: 'r1',
            seq: 1,
            user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
            attachments: [{
                attachment_id: 'a1',
                type: 'file',
                mime: 'application/pdf',
                base64: '',
                byte_length: 1000,
            }],
            context: { recent_message_count: 0 },
        }));

        expect(socket.send).toHaveBeenCalled();
        const sentMsg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
        expect(sentMsg.type).toBe('run_error');
        expect(sentMsg.error.code).toBe('UNSUPPORTED_MIME');
    });
});
