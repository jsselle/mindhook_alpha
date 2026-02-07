import { executeToolCall, TOOL_ERROR_CODES, ToolError } from '../dispatcher';

// Mock the API modules
jest.mock('../../api/deviceWriteApi');
jest.mock('../../api/deviceReadApi');
jest.mock('expo-sqlite');

import * as readApi from '../../api/deviceReadApi';
import * as writeApi from '../../api/deviceWriteApi';

describe('Tool Dispatcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
                time_anchor: null,
                confidence: 0.9,
                source_attachment_id: null,
                source_message_id: null,
                created_at: 1700000000000,
            });
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
    });

    describe('search_memory', () => {
        it('calls searchMemory and returns items', async () => {
            (readApi.searchMemory as jest.Mock).mockResolvedValue([
                { id: 'm1', subject: 'keys', predicate: 'last_seen', object: 'kitchen' },
            ]);

            const result = await executeToolCall('search_memory', {
                subject: 'keys',
                limit: 5,
                schema_version: '1',
            });

            expect(result).toEqual({
                items: [{ id: 'm1', subject: 'keys', predicate: 'last_seen', object: 'kitchen' }],
            });
        });

        it('passes optional filters correctly', async () => {
            (readApi.searchMemory as jest.Mock).mockResolvedValue([]);

            await executeToolCall('search_memory', {
                subject: 'wallet',
                type: 'object_location',
                recent_days: 7,
                limit: 10,
                schema_version: '1',
            });

            expect(readApi.searchMemory).toHaveBeenCalledWith({
                subject: 'wallet',
                type: 'object_location',
                recent_days: 7,
                limit: 10,
            });
        });
    });

    describe('search_attachments', () => {
        it('calls searchAttachments with entities', async () => {
            (readApi.searchAttachments as jest.Mock).mockResolvedValue([{ id: 'att-1' }]);

            const result = await executeToolCall('search_attachments', {
                entities: ['keys', 'kitchen'],
                limit: 5,
                schema_version: '1',
            });

            expect(result).toEqual({ attachments: [{ id: 'att-1' }] });
            expect(readApi.searchAttachments).toHaveBeenCalledWith({
                entities: ['keys', 'kitchen'],
                types: null,
                recent_days: null,
                limit: 5,
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
