import { executeToolCall, TOOL_ERROR_CODES, ToolError } from '../dispatcher';

// Mock the API modules
jest.mock('../../api/deviceWriteApi');
jest.mock('../../api/deviceReadApi');
jest.mock('expo-sqlite');
jest.mock('../../utils/uuid', () => ({
    generateUUID: jest.fn(),
}));

import * as readApi from '../../api/deviceReadApi';
import * as writeApi from '../../api/deviceWriteApi';
import { generateUUID } from '../../utils/uuid';

describe('Tool Dispatcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (readApi.attachmentExists as jest.Mock).mockResolvedValue(true);
        (generateUUID as jest.Mock).mockReturnValue('generated-id-1');
    });

    describe('schema_version validation', () => {
        it('rejects unsupported schema version', async () => {
            await expect(
                executeToolCall('search_memory', { schema_version: '2', limit: 10 })
            ).rejects.toThrow('Unsupported schema_version');
        });

        it('rejects missing schema version', async () => {
            await expect(
                executeToolCall('search_memory', { limit: 10 })
            ).rejects.toThrow('Unsupported schema_version');
        });
    });

    describe('unknown tool', () => {
        it('throws UNKNOWN_TOOL error', async () => {
            await expect(
                executeToolCall('nonexistent_tool', { schema_version: '1' })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.UNKNOWN_TOOL });
        });
    });

    describe('store_attachment_metadata', () => {
        it('calls insertAttachmentMetadata with correct args', async () => {
            const args = {
                metadata_id: 'meta-1',
                attachment_id: 'att-1',
                model: 'gemini-3',
                kind: 'transcript',
                payload: { text: 'hello' },
                created_at: 1700000000000,
                schema_version: '1',
            };

            await executeToolCall('store_attachment_metadata', args);

            expect(writeApi.insertAttachmentMetadata).toHaveBeenCalledWith({
                id: 'meta-1',
                attachment_id: 'att-1',
                model: 'gemini-3',
                kind: 'transcript',
                text: null,
                tags: null,
                event_at: null,
                payload: { text: 'hello' },
                created_at: 1700000000000,
            });
        });

        it('returns metadata_id on success', async () => {
            const result = await executeToolCall('store_attachment_metadata', {
                metadata_id: 'meta-1',
                attachment_id: 'att-1',
                model: 'gemini-3',
                kind: 'transcript',
                payload: {},
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(result).toEqual({ metadata_id: 'meta-1' });
        });

        it('generates metadata_id when omitted', async () => {
            const result = await executeToolCall('store_attachment_metadata', {
                attachment_id: 'att-1',
                model: 'gemini-3',
                kind: 'transcript',
                payload: {},
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(writeApi.insertAttachmentMetadata).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'generated-id-1' })
            );
            expect(result).toEqual({ metadata_id: 'generated-id-1' });
        });

        it('throws INVALID_ARGS when attachment_id does not exist', async () => {
            (readApi.attachmentExists as jest.Mock).mockResolvedValue(false);

            await expect(
                executeToolCall('store_attachment_metadata', {
                    metadata_id: 'meta-1',
                    attachment_id: 'missing-att',
                    model: 'gemini-3',
                    kind: 'transcript',
                    payload: {},
                    created_at: 1700000000000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });
    });

    describe('store_memory_item', () => {
        it('calls insertMemoryItem with correct args', async () => {
            const args = {
                memory_item_id: 'mem-1',
                type: 'object_location',
                subject: 'keys',
                predicate: 'last_seen',
                object: 'kitchen',
                confidence: 0.9,
                created_at: 1700000000000,
                schema_version: '1',
            };

            await executeToolCall('store_memory_item', args);

            expect(writeApi.insertMemoryItem).toHaveBeenCalledWith({
                id: 'mem-1',
                type: 'object_location',
                subject: 'keys',
                predicate: 'last_seen',
                object: 'kitchen',
                text: null,
                tags_json: null,
                event_at: null,
                time_anchor: null,
                confidence: 0.9,
                source_attachment_id: null,
                source_message_id: null,
                created_at: 1700000000000,
            });
        });

        it('generates memory_item_id when omitted', async () => {
            const result = await executeToolCall('store_memory_item', {
                type: 'object_location',
                subject: 'keys',
                predicate: 'last_seen',
                object: 'kitchen',
                confidence: 0.9,
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(writeApi.insertMemoryItem).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'generated-id-1' })
            );
            expect(result).toEqual({ memory_item_id: 'generated-id-1' });
        });
    });

    describe('index_entity', () => {
        it('calls insertEntityIndex with correct args', async () => {
            const args = {
                entity_index_id: 'idx-1',
                entity: 'kitchen',
                source_type: 'attachment',
                source_id: 'att-1',
                weight: 0.8,
                created_at: 1700000000000,
                schema_version: '1',
            };

            await executeToolCall('index_entity', args);

            expect(writeApi.insertEntityIndex).toHaveBeenCalledWith({
                id: 'idx-1',
                entity: 'kitchen',
                source_type: 'attachment',
                source_id: 'att-1',
                weight: 0.8,
                created_at: 1700000000000,
            });
        });

        it('generates entity_index_id when omitted', async () => {
            const result = await executeToolCall('index_entity', {
                entity: 'kitchen',
                source_type: 'attachment',
                source_id: 'att-1',
                weight: 0.8,
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(writeApi.insertEntityIndex).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'generated-id-1' })
            );
            expect(result).toEqual({ entity_index_id: 'generated-id-1' });
        });
    });

    describe('search_memory', () => {
        it('calls searchMemory and returns items with hydrated attachment bundle data', async () => {
            (readApi.searchMemory as jest.Mock).mockResolvedValue([
                {
                    id: 'm1',
                    source_type: 'memory',
                    memory_item_id: 'm1',
                    metadata_id: null,
                    attachment_id: 'att-1',
                    text: 'keys last seen in kitchen',
                    tags: ['keys', 'kitchen'],
                    event_at: 1700000000000,
                    created_at: 1700000000001,
                    score: 42,
                },
            ]);
            (readApi.getAttachmentBundle as jest.Mock).mockResolvedValue({
                attachment: { id: 'att-1', type: 'image' },
                metadata: [{ kind: 'scene', payload: { description: 'keys on kitchen counter' } }],
            });

            const result = await executeToolCall('search_memory', {
                text: 'keys',
                limit: 5,
                schema_version: '1',
            });

            expect(result).toEqual({
                items: [
                    {
                        id: 'm1',
                        source_type: 'memory',
                        memory_item_id: 'm1',
                        metadata_id: null,
                        attachment_id: 'att-1',
                        text: 'keys last seen in kitchen',
                        tags: ['keys', 'kitchen'],
                        event_at: 1700000000000,
                        created_at: 1700000000001,
                        score: 42,
                        attachment_bundle: {
                            attachment: { id: 'att-1', type: 'image' },
                            metadata: [{ kind: 'scene', payload: { description: 'keys on kitchen counter' } }],
                        },
                    },
                ],
            });
            expect(readApi.getAttachmentBundle).toHaveBeenCalledWith({ attachment_id: 'att-1' });
        });

        it('does not fetch attachment bundles when search results have no attachment ids', async () => {
            (readApi.searchMemory as jest.Mock).mockResolvedValue([
                {
                    id: 'm1',
                    source_type: 'memory',
                    memory_item_id: 'm1',
                    metadata_id: null,
                    attachment_id: null,
                    text: 'keys last seen in kitchen',
                    tags: ['keys', 'kitchen'],
                    event_at: 1700000000000,
                    created_at: 1700000000001,
                    score: 42,
                },
            ]);

            await executeToolCall('search_memory', {
                text: 'keys',
                limit: 5,
                schema_version: '1',
            });

            expect(readApi.getAttachmentBundle).not.toHaveBeenCalled();
        });

        it('passes optional filters correctly', async () => {
            (readApi.searchMemory as jest.Mock).mockResolvedValue([]);

            await executeToolCall('search_memory', {
                text: 'wallet',
                tags: ['wallet'],
                tag_mode: 'or',
                date_from: 1700000000000,
                date_to: 1700000005000,
                limit: 10,
                schema_version: '1',
            });

            expect(readApi.searchMemory).toHaveBeenCalledWith({
                text: 'wallet',
                tags: ['wallet'],
                tag_mode: 'or',
                date_from: 1700000000000,
                date_to: 1700000005000,
                limit: 10,
            });
        });
    });

    describe('get_attachment_bundle', () => {
        it('returns bundle for existing attachment', async () => {
            const mockBundle = {
                attachment: { id: 'att-1', type: 'image' },
                metadata: [{ kind: 'scene', payload: {} }],
            };
            (readApi.getAttachmentBundle as jest.Mock).mockResolvedValue(mockBundle);

            const result = await executeToolCall('get_attachment_bundle', {
                attachment_id: 'att-1',
                schema_version: '1',
            });

            expect(result).toEqual(mockBundle);
        });

        it('throws FILE_NOT_FOUND for missing attachment', async () => {
            (readApi.getAttachmentBundle as jest.Mock).mockResolvedValue(null);

            await expect(
                executeToolCall('get_attachment_bundle', { attachment_id: 'missing', schema_version: '1' })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.FILE_NOT_FOUND });
        });
    });

    describe('recent_messages', () => {
        it('calls getRecentMessages and returns messages', async () => {
            (readApi.getRecentMessages as jest.Mock).mockResolvedValue([
                { id: 'msg-1', role: 'user', text: 'hello' },
            ]);

            const result = await executeToolCall('recent_messages', {
                limit: 10,
                schema_version: '1',
            });

            expect(result).toEqual({
                messages: [{ id: 'msg-1', role: 'user', text: 'hello' }],
            });
        });
    });

    describe('get_message_with_attachments', () => {
        it('returns message with attachments', async () => {
            const mockResult = {
                message: { id: 'msg-1', role: 'user', text: 'photo' },
                attachments: [{ id: 'att-1', type: 'image' }],
            };
            (readApi.getMessageWithAttachments as jest.Mock).mockResolvedValue(mockResult);

            const result = await executeToolCall('get_message_with_attachments', {
                message_id: 'msg-1',
                schema_version: '1',
            });

            expect(result).toEqual(mockResult);
        });

        it('throws FILE_NOT_FOUND for missing message', async () => {
            (readApi.getMessageWithAttachments as jest.Mock).mockResolvedValue(null);

            await expect(
                executeToolCall('get_message_with_attachments', { message_id: 'missing', schema_version: '1' })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.FILE_NOT_FOUND });
        });
    });

    describe('ToolError', () => {
        it('has correct properties', () => {
            const error = new ToolError('TEST_CODE', 'Test message', true);

            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.retryable).toBe(true);
        });

        it('defaults retryable to false', () => {
            const error = new ToolError('TEST_CODE', 'Test message');
            expect(error.retryable).toBe(false);
        });
    });
});
