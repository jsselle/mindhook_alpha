jest.mock('../../tools/dispatcher');
jest.mock('../reminderNotificationService');
jest.mock('../../api/deviceReadApi');
jest.mock('../../api/deviceWriteApi');
jest.mock('../../utils/uuid', () => ({
    generateUUID: jest.fn(() => 'evt-bootstrap'),
}));

import * as Notifications from 'expo-notifications';
import { listReminders } from '../../api/deviceReadApi';
import { insertReminderEvent, updateReminder } from '../../api/deviceWriteApi';
import { setReminderNotificationScheduler } from '../../tools/dispatcher';
import {
    createReminderNotificationScheduler,
    handleReminderNotificationReceived,
    handleReminderNotificationResponse,
} from '../reminderNotificationService';
import { bootstrapNotificationRuntime, shutdownNotificationRuntimeForTests } from '../notificationBootstrap';

describe('notificationBootstrap', () => {
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

    beforeEach(() => {
        jest.clearAllMocks();
        (Notifications as { __resetNotificationsMock?: () => void }).__resetNotificationsMock?.();
        shutdownNotificationRuntimeForTests();
        (createReminderNotificationScheduler as jest.Mock).mockReturnValue({
            scheduleReminder: jest.fn(),
            cancelReminderNotifications: jest.fn(),
        });
        (listReminders as jest.Mock).mockResolvedValue([]);
        (updateReminder as jest.Mock).mockResolvedValue(undefined);
        (insertReminderEvent as jest.Mock).mockResolvedValue(undefined);
    });

    it('registers permissions, categories, listeners, and scheduler', async () => {
        await bootstrapNotificationRuntime();

        expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
        expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledTimes(2);
        expect(Notifications.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
        expect(setReminderNotificationScheduler).toHaveBeenCalled();
        expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled();
    });

    it('forwards notification callbacks to reminder handlers', async () => {
        await bootstrapNotificationRuntime();

        (Notifications as { __emitNotificationReceived: (n: unknown) => void }).__emitNotificationReceived({
            request: { content: { data: {} } },
        });
        (Notifications as { __emitNotificationResponse: (r: unknown) => void }).__emitNotificationResponse({
            actionIdentifier: 'X',
            notification: { request: { content: { data: {} } } },
        });

        expect(handleReminderNotificationReceived).toHaveBeenCalled();
        expect(handleReminderNotificationResponse).toHaveBeenCalled();
    });

    it('reconciles missing schedules for active reminders at startup', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        (listReminders as jest.Mock).mockImplementation(async (args: { offset?: number }) => {
            return (args.offset ?? 0) === 0 ? [baseReminder] : [];
        });
        (createReminderNotificationScheduler as jest.Mock).mockReturnValue({
            scheduleReminder: jest.fn().mockResolvedValue({
                due_notification_id: 'notif-due-fix',
                pre_notification_id: 'notif-pre-fix',
            }),
            cancelReminderNotifications: jest.fn(),
        });

        await bootstrapNotificationRuntime();

        expect(updateReminder).toHaveBeenCalledWith(expect.objectContaining({
            id: 'rem-1',
            patch: expect.objectContaining({
                due_notification_id: 'notif-due-fix',
                pre_notification_id: 'notif-pre-fix',
                last_error: null,
            }),
        }));
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'scheduled_notifications',
        }));
        jest.restoreAllMocks();
    });

    it('deduplicates concurrent bootstrap calls', async () => {
        await Promise.all([
            bootstrapNotificationRuntime(),
            bootstrapNotificationRuntime(),
            bootstrapNotificationRuntime(),
        ]);

        expect(Notifications.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
        expect(setReminderNotificationScheduler).toHaveBeenCalledTimes(1);
    });

    it('continues bootstrap when reminder queries fail', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        (listReminders as jest.Mock).mockRejectedValue(new Error('no such table: reminders'));

        await expect(bootstrapNotificationRuntime()).resolves.toBeUndefined();

        expect(Notifications.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('paginates reminder reads beyond first page during bootstrap', async () => {
        const page = Array.from({ length: 200 }, (_, idx) => ({
            ...baseReminder,
            id: `rem-${idx}`,
        }));
        (listReminders as jest.Mock).mockImplementation(async (args: { offset?: number; limit: number }) => {
            if ((args.offset ?? 0) === 0) return page;
            return [];
        });

        await bootstrapNotificationRuntime();

        expect(listReminders).toHaveBeenCalledWith(expect.objectContaining({ offset: 0, limit: 200 }));
        expect(listReminders).toHaveBeenCalledWith(expect.objectContaining({ offset: 200, limit: 200 }));
    });
});
