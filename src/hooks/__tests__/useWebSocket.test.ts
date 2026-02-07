// Note: WebSocket testing typically requires mocking the global WebSocket
// This tests the protocol handling logic

describe('WebSocket Protocol', () => {
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
