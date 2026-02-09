import {
    executeToolCall,
    setReminderNotificationScheduler,
    TOOL_ERROR_CODES,
    ToolError,
} from '../dispatcher';

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
    let scheduleReminderMock: jest.Mock;
    let cancelReminderNotificationsMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        (readApi.attachmentExists as jest.Mock).mockResolvedValue(true);
        (readApi.messageExists as jest.Mock).mockResolvedValue(true);
        (readApi.getReminderById as jest.Mock).mockResolvedValue(null);
        (readApi.listReminders as jest.Mock).mockResolvedValue([]);
        (generateUUID as jest.Mock).mockReturnValue('generated-id-1');
        scheduleReminderMock = jest.fn().mockResolvedValue({
            due_notification_id: null,
            pre_notification_id: null,
        });
        cancelReminderNotificationsMock = jest.fn().mockResolvedValue(undefined);
        setReminderNotificationScheduler({
            scheduleReminder: scheduleReminderMock,
            cancelReminderNotifications: cancelReminderNotificationsMock,
        });
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

        it('keeps source_message_id when it exists', async () => {
            await executeToolCall('store_memory_item', {
                memory_item_id: 'mem-1',
                type: 'fact',
                subject: 'user',
                predicate: 'likes',
                object: 'tea',
                confidence: 0.9,
                source_message_id: 'msg-1',
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(readApi.messageExists).toHaveBeenCalledWith({ message_id: 'msg-1' });
            expect(writeApi.insertMemoryItem).toHaveBeenCalledWith(
                expect.objectContaining({ source_message_id: 'msg-1' })
            );
        });

        it('drops invalid source_message_id and still stores memory item', async () => {
            (readApi.messageExists as jest.Mock).mockResolvedValueOnce(false);

            await executeToolCall('store_memory_item', {
                memory_item_id: 'mem-1',
                type: 'fact',
                subject: 'user',
                predicate: 'likes',
                object: 'tea',
                confidence: 0.9,
                source_message_id: 'missing-msg',
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(readApi.messageExists).toHaveBeenCalledWith({ message_id: 'missing-msg' });
            expect(writeApi.insertMemoryItem).toHaveBeenCalledWith(
                expect.objectContaining({ source_message_id: null })
            );
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

    describe('reminder tools', () => {
        const baseReminder = {
            id: 'rem-1',
            title: 'Pay bill',
            topic: null,
            notes: null,
            due_at: 1700000600000,
            timezone: 'America/Los_Angeles',
            status: 'scheduled',
            source_message_id: null,
            source_run_id: null,
            pre_alert_minutes: 10,
            due_notification_id: null,
            pre_notification_id: null,
            delivered_at: null,
            completed_at: null,
            deleted_at: null,
            deleted_reason: null,
            last_error: null,
            metadata_json: null,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        };

        beforeEach(() => {
            jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('create_reminder rejects past due dates', async () => {
            await expect(
                executeToolCall('create_reminder', {
                    title: 'Late task',
                    due_at: 1699999969000,
                    timezone: 'America/Los_Angeles',
                    created_at: 1700000000000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });

        it('create_reminder rejects due dates farther than 2 years', async () => {
            await expect(
                executeToolCall('create_reminder', {
                    title: 'Far future task',
                    due_at: 1763072000001,
                    timezone: 'America/Los_Angeles',
                    created_at: 1700000000000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });

        it('create_reminder persists reminder and event', async () => {
            scheduleReminderMock.mockResolvedValueOnce({
                due_notification_id: 'due-1',
                pre_notification_id: 'pre-1',
            });
            const result = await executeToolCall('create_reminder', {
                reminder_id: 'rem-1',
                title: 'Pay bill',
                due_at: 1700000600000,
                timezone: 'America/Los_Angeles',
                pre_alert_minutes: 10,
                created_at: 1700000000000,
                schema_version: '1',
            });

            expect(writeApi.insertReminder).toHaveBeenCalledWith(expect.objectContaining({
                id: 'rem-1',
                status: 'scheduled',
            }));
            expect(writeApi.insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
                reminder_id: 'rem-1',
                event_type: 'created',
            }));
            expect(writeApi.updateReminder).toHaveBeenCalledWith(expect.objectContaining({
                id: 'rem-1',
                patch: expect.objectContaining({
                    due_notification_id: 'due-1',
                    pre_notification_id: 'pre-1',
                }),
            }));
            expect(result).toEqual({
                reminder_id: 'rem-1',
                status: 'scheduled',
                due_at: 1700000600000,
                pre_alert_at: 1700000000000,
            });
        });

        it('update_reminder throws FILE_NOT_FOUND for unknown reminder', async () => {
            await expect(
                executeToolCall('update_reminder', {
                    reminder_id: 'missing',
                    updated_at: 1700000200000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.FILE_NOT_FOUND });
        });

        it('update_reminder updates existing reminder', async () => {
            (readApi.getReminderById as jest.Mock)
                .mockResolvedValueOnce(baseReminder)
                .mockResolvedValueOnce({ ...baseReminder, title: 'Pay utilities' });

            const result = await executeToolCall('update_reminder', {
                reminder_id: 'rem-1',
                title: 'Pay utilities',
                updated_at: 1700000200000,
                schema_version: '1',
            });

            expect(writeApi.updateReminder).toHaveBeenCalledWith(expect.objectContaining({
                id: 'rem-1',
                updated_at: 1700000200000,
                expected_updated_at: 1700000000000,
            }));
            expect(writeApi.insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
                reminder_id: 'rem-1',
                event_type: 'updated',
            }));
            expect(result).toEqual({
                reminder_id: 'rem-1',
                status: 'scheduled',
                due_at: 1700000600000,
                pre_alert_at: 1700000000000,
            });
        });

        it('cancel_reminder throws FILE_NOT_FOUND for unknown reminder', async () => {
            await expect(
                executeToolCall('cancel_reminder', {
                    reminder_id: 'missing',
                    deleted_at: 1700000300000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.FILE_NOT_FOUND });
        });

        it('cancel_reminder logically deletes reminder', async () => {
            (readApi.getReminderById as jest.Mock)
                .mockResolvedValueOnce(baseReminder)
                .mockResolvedValueOnce({ ...baseReminder, status: 'deleted' });

            const result = await executeToolCall('cancel_reminder', {
                reminder_id: 'rem-1',
                deleted_at: 1700000300000,
                reason: 'user_cancelled',
                schema_version: '1',
            });

            expect(writeApi.logicalDeleteReminder).toHaveBeenCalledWith({
                id: 'rem-1',
                deleted_at: 1700000300000,
                reason: 'user_cancelled',
                updated_at: 1700000300000,
                expected_updated_at: 1700000000000,
            });
            expect(writeApi.insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
                reminder_id: 'rem-1',
                event_type: 'deleted',
                actor: 'llm',
            }));
            expect(result).toEqual({
                reminder_id: 'rem-1',
                status: 'deleted',
                deleted_at: 1700000300000,
            });
        });

        it('cancel_reminder supports explicit actor override', async () => {
            (readApi.getReminderById as jest.Mock)
                .mockResolvedValueOnce(baseReminder)
                .mockResolvedValueOnce({ ...baseReminder, status: 'deleted' });

            await executeToolCall('cancel_reminder', {
                reminder_id: 'rem-1',
                deleted_at: 1700000300000,
                reason: 'deleted_from_drawer',
                actor: 'user',
                schema_version: '1',
            });

            expect(writeApi.insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
                reminder_id: 'rem-1',
                event_type: 'deleted',
                actor: 'user',
            }));
        });

        it('update_reminder rejects immutable created_at', async () => {
            (readApi.getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

            await expect(
                executeToolCall('update_reminder', {
                    reminder_id: 'rem-1',
                    created_at: 123,
                    updated_at: 1700000200000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });

        it('update_reminder rejects null timezone', async () => {
            (readApi.getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

            await expect(
                executeToolCall('update_reminder', {
                    reminder_id: 'rem-1',
                    timezone: null,
                    updated_at: 1700000200000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });

        it('update_reminder rejects null title', async () => {
            (readApi.getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

            await expect(
                executeToolCall('update_reminder', {
                    reminder_id: 'rem-1',
                    title: null,
                    updated_at: 1700000200000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });

        it('update_reminder rejects due dates farther than 2 years', async () => {
            (readApi.getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

            await expect(
                executeToolCall('update_reminder', {
                    reminder_id: 'rem-1',
                    due_at: 1763072000001,
                    updated_at: 1700000200000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INVALID_ARGS });
        });

        it('create_reminder persists schedule_error and throws when scheduler fails', async () => {
            scheduleReminderMock.mockRejectedValueOnce(new Error('notification permission denied'));

            await expect(
                executeToolCall('create_reminder', {
                    reminder_id: 'rem-1',
                    title: 'Pay bill',
                    due_at: 1700000600000,
                    timezone: 'America/Los_Angeles',
                    created_at: 1700000000000,
                    schema_version: '1',
                })
            ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.INTERNAL_ERROR, retryable: true });

            expect(writeApi.updateReminder).toHaveBeenCalledWith(expect.objectContaining({
                id: 'rem-1',
                patch: { last_error: 'notification permission denied' },
            }));
            expect(writeApi.insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
                reminder_id: 'rem-1',
                event_type: 'schedule_error',
            }));
        });

        it('list_reminders forwards filters', async () => {
            (readApi.listReminders as jest.Mock).mockResolvedValueOnce([baseReminder]);

            const result = await executeToolCall('list_reminders', {
                statuses: ['scheduled'],
                include_deleted: false,
                limit: 10,
                offset: 5,
                schema_version: '1',
            });

            expect(readApi.listReminders).toHaveBeenCalledWith({
                statuses: ['scheduled'],
                include_deleted: false,
                limit: 10,
                offset: 5,
            });
            expect(result).toEqual({ reminders: [baseReminder] });
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
