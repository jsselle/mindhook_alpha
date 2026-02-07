import { ALLOWED_MIMES, validateEnvelope, validateRunStart } from '../src/ws/protocol';

describe('Protocol Validation', () => {
    describe('validateEnvelope', () => {
        it('accepts valid envelope', () => {
            const result = validateEnvelope({
                protocol_version: '1.0',
                app_version: '1.0.0',
                type: 'run_start',
                run_id: 'abc-123',
                seq: 1,
            });
            expect(result.valid).toBe(true);
        });

        it('rejects unsupported protocol version', () => {
            const result = validateEnvelope({
                protocol_version: '2.0',
                type: 'run_start',
                run_id: 'abc',
                seq: 1,
            });
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('UNSUPPORTED_PROTOCOL');
        });

        it('rejects null message', () => {
            const result = validateEnvelope(null);
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('INVALID_MESSAGE');
        });

        it('rejects missing required fields', () => {
            const result = validateEnvelope({
                protocol_version: '1.0',
                type: 'run_start',
                // missing run_id and seq
            });
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('INVALID_MESSAGE');
        });
    });

    describe('validateRunStart', () => {
        const validMsg = {
            protocol_version: '1.0',
            app_version: '1.0.0',
            type: 'run_start' as const,
            run_id: 'run-1',
            seq: 1,
            user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
            attachments: [],
            context: { recent_message_count: 0 },
        };

        it('accepts valid run_start', () => {
            expect(validateRunStart(validMsg).valid).toBe(true);
        });

        it('accepts run_start with valid attachments', () => {
            const msg = {
                ...validMsg,
                attachments: [
                    {
                        attachment_id: 'a1',
                        type: 'image' as const,
                        mime: 'image/jpeg',
                        base64: 'abc123',
                        byte_length: 1000,
                    },
                ],
            };
            expect(validateRunStart(msg).valid).toBe(true);
        });

        it('rejects too many attachments', () => {
            const msg = {
                ...validMsg,
                attachments: Array(10).fill({
                    attachment_id: 'a1',
                    type: 'image',
                    mime: 'image/jpeg',
                    base64: '',
                    byte_length: 1000,
                }),
            };
            const result = validateRunStart(msg);
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('PAYLOAD_TOO_LARGE');
        });

        it('rejects attachment exceeding size limit', () => {
            const msg = {
                ...validMsg,
                attachments: [
                    {
                        attachment_id: 'a1',
                        type: 'image' as const,
                        mime: 'image/jpeg',
                        base64: '',
                        byte_length: 10 * 1024 * 1024, // 10 MB
                    },
                ],
            };
            const result = validateRunStart(msg);
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('PAYLOAD_TOO_LARGE');
        });

        it('rejects unsupported MIME type', () => {
            const msg = {
                ...validMsg,
                attachments: [
                    {
                        attachment_id: 'a1',
                        type: 'file' as const,
                        mime: 'application/pdf',
                        base64: '',
                        byte_length: 1000,
                    },
                ],
            };
            const result = validateRunStart(msg);
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('UNSUPPORTED_MIME');
        });

        it('rejects total payload exceeding limit', () => {
            const msg = {
                ...validMsg,
                attachments: Array(5).fill({
                    attachment_id: 'a1',
                    type: 'image',
                    mime: 'image/jpeg',
                    base64: '',
                    byte_length: 5 * 1024 * 1024, // 5 MB each = 25 MB total
                }),
            };
            const result = validateRunStart(msg);
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('PAYLOAD_TOO_LARGE');
        });
    });

    describe('ALLOWED_MIMES', () => {
        it('includes expected image types', () => {
            expect(ALLOWED_MIMES.has('image/jpeg')).toBe(true);
            expect(ALLOWED_MIMES.has('image/png')).toBe(true);
            expect(ALLOWED_MIMES.has('image/webp')).toBe(true);
        });

        it('includes expected audio types', () => {
            expect(ALLOWED_MIMES.has('audio/mp4')).toBe(true);
            expect(ALLOWED_MIMES.has('audio/m4a')).toBe(true);
            expect(ALLOWED_MIMES.has('audio/aac')).toBe(true);
            expect(ALLOWED_MIMES.has('audio/webm')).toBe(true);
        });

        it('includes expected video types', () => {
            expect(ALLOWED_MIMES.has('video/mp4')).toBe(true);
            expect(ALLOWED_MIMES.has('video/webm')).toBe(true);
        });

        it('excludes unsupported types', () => {
            expect(ALLOWED_MIMES.has('application/pdf')).toBe(false);
            expect(ALLOWED_MIMES.has('text/plain')).toBe(false);
        });
    });
});
