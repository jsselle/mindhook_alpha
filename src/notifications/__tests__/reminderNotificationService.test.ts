jest.mock('../../api/deviceReadApi');
jest.mock('../../api/deviceWriteApi');
jest.mock('../replyBridgeStore');
jest.mock('../../utils/uuid', () => ({
    generateUUID: jest.fn(() => 'evt-1'),
}));

import * as Notifications from 'expo-notifications';
import { getReminderById } from '../../api/deviceReadApi';
import { insertReminderEvent, logicalDeleteReminder, updateReminder } from '../../api/deviceWriteApi';
import {
    createReminderNotificationScheduler,
    handleReminderNotificationReceived,
    handleReminderNotificationResponse,
} from '../reminderNotificationService';
import { enqueuePendingReminderReply } from '../replyBridgeStore';
import {
    REMINDER_ACTION_ACCEPT,
    REMINDER_ACTION_DISMISS,
    REMINDER_ACTION_EARLY_DISMISS,
    REMINDER_ACTION_REPLY,
    REMINDER_ACTION_SNOOZE_10M,
} from '../types';

const baseReminder = {
    id: 'rem-1',
    title: 'Pay bill',
    topic: null,
    notes: null,
    due_at: 1700000600000,
    timezone: 'America/Los_Angeles',
    status: 'scheduled' as const,
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

describe('reminderNotificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (Notifications as { __resetNotificationsMock?: () => void }).__resetNotificationsMock?.();
        (enqueuePendingReminderReply as jest.Mock).mockResolvedValue({
            id: 'bridge-1',
            reminder_id: 'rem-1',
            typed_text: 'I am running late',
            notification_action_id: REMINDER_ACTION_REPLY,
            trigger_kind: 'due',
            created_at: 1700000000000,
            consumed_at: null,
        });
    });

    it('schedules due + pre-alert when both are future', async () => {
        const scheduler = createReminderNotificationScheduler();
        const result = await scheduler.scheduleReminder({
            reminder: {
                ...baseReminder,
                due_at: 1700001200000,
                pre_alert_minutes: 10,
                due_notification_id: null,
                pre_notification_id: null,
            },
            now_ms: 1700000000000,
        });

        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            due_notification_id: 'notif-1',
            pre_notification_id: 'notif-2',
        });
    });

    it('skips pre-alert scheduling inside pre-alert window', async () => {
        const scheduler = createReminderNotificationScheduler();
        const result = await scheduler.scheduleReminder({
            reminder: { ...baseReminder, pre_alert_minutes: 10 },
            now_ms: baseReminder.due_at - 9 * 60000,
        });

        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            due_notification_id: 'notif-1',
            pre_notification_id: null,
        });
    });

    it('cancels old notification IDs before rescheduling', async () => {
        const scheduler = createReminderNotificationScheduler();
        await scheduler.scheduleReminder({
            reminder: { ...baseReminder, due_notification_id: 'old-due', pre_notification_id: 'old-pre' },
            now_ms: 1700000000000,
        });

        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-due');
        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-pre');
    });

    it('accept action marks completed and writes event', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_ACCEPT,
            notification: {
                request: {
                    content: {
                        data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' },
                    },
                },
            },
        } as unknown as Notifications.NotificationResponse);

        expect(updateReminder).toHaveBeenCalledWith(expect.objectContaining({
            id: 'rem-1',
            patch: expect.objectContaining({ status: 'completed', completed_at: 1700000000000 }),
        }));
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'completed',
        }));
        jest.restoreAllMocks();
    });

    it('dismiss actions logically delete with expected reasons', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValue(baseReminder);

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_DISMISS,
            notification: { request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } } },
        } as unknown as Notifications.NotificationResponse);
        expect(logicalDeleteReminder).toHaveBeenCalledWith(expect.objectContaining({
            id: 'rem-1',
            reason: 'dismissed_from_notification',
        }));

        (logicalDeleteReminder as jest.Mock).mockClear();
        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_EARLY_DISMISS,
            notification: { request: { content: { data: { reminder_id: 'rem-1', kind: 'pre_alert', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } } },
        } as unknown as Notifications.NotificationResponse);
        expect(logicalDeleteReminder).toHaveBeenCalledWith(expect.objectContaining({
            id: 'rem-1',
            reason: 'early_dismiss_pre_alert',
        }));
        jest.restoreAllMocks();
    });

    it('snooze updates due roughly now+10m and reschedules', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock)
            .mockResolvedValueOnce(baseReminder)
            .mockResolvedValueOnce({ ...baseReminder, status: 'snoozed', due_at: 1700000600000, updated_at: 1700000000000 });

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_SNOOZE_10M,
            notification: { request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } } },
        } as unknown as Notifications.NotificationResponse);

        expect(updateReminder).toHaveBeenCalledWith(expect.objectContaining({
            id: 'rem-1',
            patch: expect.objectContaining({ status: 'snoozed', due_at: 1700000600000 }),
        }));
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'snoozed',
        }));
        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    it('terminal reminders ignore actions', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValueOnce({ ...baseReminder, status: 'completed' });

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_ACCEPT,
            notification: { request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } } },
        } as unknown as Notifications.NotificationResponse);

        expect(updateReminder).not.toHaveBeenCalled();
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'updated',
            payload_json: expect.stringContaining('action_ignored_terminal'),
        }));
        jest.restoreAllMocks();
    });

    it('ignores stale notification actions when due_at does not match latest reminder', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValueOnce({ ...baseReminder, due_at: 1700001200000 });

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_DISMISS,
            notification: { request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } } },
        } as unknown as Notifications.NotificationResponse);

        expect(updateReminder).not.toHaveBeenCalled();
        expect(logicalDeleteReminder).not.toHaveBeenCalled();
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'updated',
            payload_json: expect.stringContaining('stale_notification_action_ignored'),
        }));
        jest.restoreAllMocks();
    });

    it('reply action writes reply_requested event', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_REPLY,
            userText: 'I am running late',
            notification: { request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } } },
        } as unknown as Notifications.NotificationResponse);

        expect(enqueuePendingReminderReply).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            typed_text: 'I am running late',
            notification_action_id: REMINDER_ACTION_REPLY,
        }));
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'reply_requested',
        }));
        jest.restoreAllMocks();
    });

    it('due notification capture marks triggered and logs event', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

        await handleReminderNotificationReceived({
            request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } },
        } as unknown as Notifications.Notification);

        expect(updateReminder).toHaveBeenCalledWith(expect.objectContaining({
            patch: expect.objectContaining({ status: 'triggered', delivered_at: 1700000000000 }),
        }));
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'due_triggered',
        }));
        jest.restoreAllMocks();
    });

    it('ignores stale due notification received payloads', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (getReminderById as jest.Mock).mockResolvedValueOnce({ ...baseReminder, due_at: 1700001200000 });

        await handleReminderNotificationReceived({
            request: { content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700000600000, source: 'reminder_scheduler_v1' } } },
        } as unknown as Notifications.Notification);

        expect(updateReminder).not.toHaveBeenCalled();
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'updated',
            payload_json: expect.stringContaining('stale_notification_ignored'),
        }));
        jest.restoreAllMocks();
    });
});
