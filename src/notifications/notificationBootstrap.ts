import * as Notifications from 'expo-notifications';
import { listReminders } from '../api/deviceReadApi';
import { insertReminderEvent, updateReminder } from '../api/deviceWriteApi';
import { getDatabase } from '../db/connection';
import { setReminderNotificationScheduler } from '../tools/dispatcher';
import {
    createReminderNotificationScheduler,
    handleReminderNotificationReceived,
    handleReminderNotificationResponse,
} from './reminderNotificationService';
import { ReminderRow } from '../types/domain';
import { generateUUID } from '../utils/uuid';
import {
    REMINDER_ACTION_ACCEPT,
    REMINDER_ACTION_DISMISS,
    REMINDER_ACTION_EARLY_DISMISS,
    REMINDER_ACTION_REPLY,
    REMINDER_ACTION_SNOOZE_10M,
    REMINDER_NOTIFICATION_CATEGORY_DUE,
    REMINDER_NOTIFICATION_CATEGORY_PRE_ALERT,
    REMINDER_NOTIFICATION_CHANNEL_DUE_ID,
    REMINDER_NOTIFICATION_CHANNEL_PRE_ALERT_ID,
    ReminderNotificationData,
} from './types';

let bootstrapped = false;
let subscriptions: Array<{ remove: () => void }> = [];
let bootstrapPromise: Promise<void> | null = null;

const ACTIVE_REMINDER_STATUSES: Array<'scheduled' | 'snoozed' | 'triggered'> = ['scheduled', 'snoozed', 'triggered'];
const REMINDER_PAGE_SIZE = 200;

export const bootstrapNotificationRuntime = async (): Promise<void> => {
    if (bootstrapped) return;
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
        Notifications.setNotificationHandler({
            handleNotification: async (notification) => {
                const data = extractReminderNotificationData(notification?.request?.content?.data);
                const isPreAlert = data?.kind === 'pre_alert';
                return {
                    shouldShowBanner: !isPreAlert,
                    shouldShowList: true,
                    shouldPlaySound: !isPreAlert,
                    shouldSetBadge: false,
                };
            },
        });

        await Notifications.requestPermissionsAsync();

        try {
            await Notifications.setNotificationChannelAsync(REMINDER_NOTIFICATION_CHANNEL_DUE_ID, {
                name: 'Reminders (Due)',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 150, 250],
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            });
            await Notifications.setNotificationChannelAsync(REMINDER_NOTIFICATION_CHANNEL_PRE_ALERT_ID, {
                name: 'Reminders (Heads-up)',
                importance: Notifications.AndroidImportance.DEFAULT,
                vibrationPattern: [0],
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                sound: null,
            });
        } catch {
            // Channel APIs are Android-only; no-op on unsupported platforms.
        }

        await Notifications.setNotificationCategoryAsync(REMINDER_NOTIFICATION_CATEGORY_DUE, [
            { identifier: REMINDER_ACTION_ACCEPT, buttonTitle: 'Done' },
            { identifier: REMINDER_ACTION_DISMISS, buttonTitle: 'Dismiss', options: { isDestructive: true } },
            { identifier: REMINDER_ACTION_SNOOZE_10M, buttonTitle: 'Snooze 10m' },
            {
                identifier: REMINDER_ACTION_REPLY,
                buttonTitle: 'Reply',
                options: { opensAppToForeground: true },
                textInput: {
                    submitButtonTitle: 'Send',
                    placeholder: 'Type a reply',
                },
            } as Notifications.NotificationAction,
        ]);
        await Notifications.setNotificationCategoryAsync(REMINDER_NOTIFICATION_CATEGORY_PRE_ALERT, [
            { identifier: REMINDER_ACTION_EARLY_DISMISS, buttonTitle: 'Dismiss', options: { isDestructive: true } },
        ]);

        const scheduler = createReminderNotificationScheduler();
        subscriptions = [
            Notifications.addNotificationReceivedListener((notification) => {
                void handleReminderNotificationReceived(notification);
            }),
            Notifications.addNotificationResponseReceivedListener((response) => {
                void handleReminderNotificationResponse(response);
            }),
        ];

        setReminderNotificationScheduler(scheduler);

        try {
            await reconcileReminderSchedulesOnStartup(scheduler);
        } catch (error) {
            console.warn('[reminder_bootstrap] reconcile_failed', error instanceof Error ? error.message : 'Unknown error');
        }

        try {
            await emitReminderDebugCounters();
        } catch (error) {
            console.warn('[reminder_bootstrap] debug_counters_failed', error instanceof Error ? error.message : 'Unknown error');
        }

        bootstrapped = true;
    })();

    try {
        await bootstrapPromise;
    } finally {
        bootstrapPromise = null;
    }
};

const extractReminderNotificationData = (data: unknown): ReminderNotificationData | null => {
    if (!data || typeof data !== 'object') return null;
    const raw = data as Partial<ReminderNotificationData>;
    if (!raw.reminder_id || !raw.kind || (raw.kind !== 'pre_alert' && raw.kind !== 'due')) return null;
    if (typeof raw.due_at !== 'number' || Number.isNaN(raw.due_at)) return null;
    if (raw.source !== 'reminder_scheduler_v1') return null;
    return raw as ReminderNotificationData;
};

export const shutdownNotificationRuntimeForTests = (): void => {
    for (const sub of subscriptions) {
        sub.remove();
    }
    subscriptions = [];
    bootstrapped = false;
    bootstrapPromise = null;
};

const reconcileReminderSchedulesOnStartup = async (
    scheduler: {
        scheduleReminder(args: {
            reminder: ReminderRow;
            now_ms: number;
        }): Promise<{ due_notification_id: string | null; pre_notification_id: string | null }>;
    }
): Promise<void> => {
    const now = Date.now();
    const activeReminders = await listAllActiveReminders();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduled.map((item) => item.identifier));

    for (const reminder of activeReminders) {
        const dueAtFuture = reminder.due_at > now;
        const preAlertAt = reminder.due_at - reminder.pre_alert_minutes * 60000;
        const preAlertRelevant = preAlertAt > now;

        const hasDue = reminder.due_notification_id != null && scheduledIds.has(reminder.due_notification_id);
        const hasPre = reminder.pre_notification_id != null && scheduledIds.has(reminder.pre_notification_id);
        const needsDue = dueAtFuture && !hasDue;
        const needsPre = preAlertRelevant && !hasPre;
        if (!needsDue && !needsPre) continue;

        try {
            const scheduling = await scheduler.scheduleReminder({
                reminder,
                now_ms: now,
            });
            await updateReminder({
                id: reminder.id,
                patch: {
                    due_notification_id: scheduling.due_notification_id,
                    pre_notification_id: scheduling.pre_notification_id,
                    last_error: null,
                },
                updated_at: now,
                expected_updated_at: reminder.updated_at,
            });
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: reminder.id,
                event_type: 'scheduled_notifications',
                event_at: now,
                actor: 'system',
                payload_json: JSON.stringify({
                    source: 'bootstrap_reconcile',
                    missing_due: needsDue,
                    missing_pre_alert: needsPre,
                    due_notification_id: scheduling.due_notification_id,
                    pre_notification_id: scheduling.pre_notification_id,
                }),
                created_at: now,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown scheduling error';
            await updateReminder({
                id: reminder.id,
                patch: { last_error: message },
                updated_at: now,
                expected_updated_at: reminder.updated_at,
            }).catch(() => undefined);
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: reminder.id,
                event_type: 'schedule_error',
                event_at: now,
                actor: 'system',
                payload_json: JSON.stringify({
                    source: 'bootstrap_reconcile',
                    error: message,
                    missing_due: needsDue,
                    missing_pre_alert: needsPre,
                }),
                created_at: now,
            });
        }
    }
};

const emitReminderDebugCounters = async (): Promise<void> => {
    const now = Date.now();
    const activeReminders = await listAllActiveReminders();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduled.map((item) => item.identifier));

    let scheduledDueCount = 0;
    let scheduledPreAlertCount = 0;
    for (const reminder of activeReminders) {
        if (reminder.due_notification_id && scheduledIds.has(reminder.due_notification_id)) {
            scheduledDueCount += 1;
        }
        if (reminder.pre_notification_id && scheduledIds.has(reminder.pre_notification_id)) {
            scheduledPreAlertCount += 1;
        }
    }

    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const db = getDatabase();
    const rows = await db.getAllAsync<{ event_type: string; count: number }>(
        `SELECT event_type, COUNT(*) as count
         FROM reminder_events
         WHERE event_at >= ?
         GROUP BY event_type`,
        [twentyFourHoursAgo]
    );
    const eventCounts = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.event_type] = row.count;
        return acc;
    }, {});

    console.log('[reminder_bootstrap] debug_counters', JSON.stringify({
        active_reminders: activeReminders.length,
        scheduled_due_notifications: scheduledDueCount,
        scheduled_pre_alert_notifications: scheduledPreAlertCount,
        events_last_24h_by_type: eventCounts,
    }));
};

const listAllActiveReminders = async (): Promise<ReminderRow[]> => {
    const rows: ReminderRow[] = [];
    let offset = 0;
    while (true) {
        const page = await listReminders({
            statuses: ACTIVE_REMINDER_STATUSES,
            include_deleted: false,
            limit: REMINDER_PAGE_SIZE,
            offset,
        });
        rows.push(...page);
        if (page.length < REMINDER_PAGE_SIZE) {
            break;
        }
        offset += REMINDER_PAGE_SIZE;
        if (offset > 10000) {
            // Defensive guard against accidental infinite pagination in degraded states.
            break;
        }
    }
    return rows;
};
