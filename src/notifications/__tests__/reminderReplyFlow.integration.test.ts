jest.mock('../../api/deviceReadApi');
jest.mock('../../api/deviceWriteApi');
jest.mock('../../utils/uuid', () => ({
    generateUUID: jest.fn(() => 'evt-1'),
}));
jest.mock('../replyBridgeStore', () => {
    const queue: Array<Record<string, unknown>> = [];
    return {
        enqueuePendingReminderReply: jest.fn(async (args: Record<string, unknown>) => {
            const row = {
                id: 'bridge-1',
                reminder_id: args.reminder_id,
                typed_text: args.typed_text ?? null,
                notification_action_id: args.notification_action_id,
                trigger_kind: args.trigger_kind,
                created_at: args.created_at,
                consumed_at: null,
            };
            queue.push(row);
            return row;
        }),
        consumeNextPendingReminderReply: jest.fn(async () => {
            const item = queue.find((q) => q.consumed_at == null);
            if (!item) return null;
            item.consumed_at = Date.now();
            return item;
        }),
        releasePendingReminderReply: jest.fn(async ({ id }: { id: string }) => {
            const item = queue.find((q) => q.id === id);
            if (item) item.consumed_at = null;
        }),
    };
});

import { getReminderById } from '../../api/deviceReadApi';
import { insertReminderEvent } from '../../api/deviceWriteApi';
import { getDatabase, setDatabaseInstance } from '../../db/connection';
import { processNextPendingReminderReply } from '../../screens/reminderReplyForegroundBridge';
import { handleReminderNotificationResponse } from '../reminderNotificationService';
import { REMINDER_ACTION_REPLY } from '../types';

const baseReminder = {
    id: 'rem-1',
    title: 'Prepare slides',
    topic: null,
    notes: null,
    due_at: 1700000600000,
    timezone: 'America/Los_Angeles',
    status: 'triggered' as const,
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

describe('reminder reply foreground bridge integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setDatabaseInstance(null);
        getDatabase();
        (getReminderById as jest.Mock).mockResolvedValue(baseReminder);
    });

    it('notification reply -> pending created -> chat send -> reply_sent_to_llm logged', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700001000000);

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_REPLY,
            userText: 'Will do in 15 minutes',
            notification: {
                request: {
                    content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } },
                },
            },
        } as never);

        const sendDraft = jest.fn().mockResolvedValue(undefined);
        const processed = await processNextPendingReminderReply({ sendDraft });

        expect(processed).toBe(true);
        expect(sendDraft).toHaveBeenCalledTimes(1);
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'reply_requested',
        }));
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'reply_sent_to_llm',
        }));
        jest.restoreAllMocks();
    });
});
