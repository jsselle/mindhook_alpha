import * as Notifications from 'expo-notifications';
import { getDatabase } from '../db/connection';
import { getReminderById } from '../api/deviceReadApi';
import { insertReminderEvent, logicalDeleteReminder, updateReminder } from '../api/deviceWriteApi';
import { enqueuePendingReminderReply } from './replyBridgeStore';
import { ReminderRow, ReminderStatus } from '../types/domain';
import { generateUUID } from '../utils/uuid';
import {
    REMINDER_ACTION_ACCEPT,
    REMINDER_ACTION_DISMISS,
    REMINDER_ACTION_EARLY_DISMISS,
    REMINDER_ACTION_REPLY,
    REMINDER_ACTION_SNOOZE_10M,
    ReminderNotificationData,
    REMINDER_NOTIFICATION_CATEGORY_DUE,
    REMINDER_NOTIFICATION_CATEGORY_PRE_ALERT,
    REMINDER_NOTIFICATION_CHANNEL_DUE_ID,
    REMINDER_NOTIFICATION_CHANNEL_PRE_ALERT_ID,
} from './types';

const TEN_MINUTES_MS = 10 * 60000;

export const createReminderNotificationScheduler = () => ({
    scheduleReminder: async (args: {
        reminder: ReminderRow;
        now_ms: number;
    }): Promise<{ due_notification_id: string | null; pre_notification_id: string | null }> => {
        const reminder = args.reminder;
        await cancelReminderNotifications({ reminder });

        let dueNotificationId: string | null = null;
        let preNotificationId: string | null = null;

        if (reminder.due_at > args.now_ms) {
            dueNotificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: reminder.title,
                    body: `Reminder due now: ${reminder.title}`,
                    categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY_DUE,
                    data: buildNotificationData(reminder, 'due'),
                    sound: 'default',
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(reminder.due_at),
                    channelId: REMINDER_NOTIFICATION_CHANNEL_DUE_ID,
                },
            });
        }

        const preAlertAt = reminder.due_at - reminder.pre_alert_minutes * 60000;
        if (preAlertAt > args.now_ms) {
            preNotificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: `Reminder coming soon: ${reminder.title}`,
                    body: `Due at ${new Date(reminder.due_at).toLocaleTimeString()}`,
                    categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY_PRE_ALERT,
                    data: buildNotificationData(reminder, 'pre_alert'),
                    sound: null,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(preAlertAt),
                    channelId: REMINDER_NOTIFICATION_CHANNEL_PRE_ALERT_ID,
                },
            });
        }

        return {
            due_notification_id: dueNotificationId,
            pre_notification_id: preNotificationId,
        };
    },
    cancelReminderNotifications,
});

export const cancelReminderNotifications = async (args: { reminder: ReminderRow }): Promise<void> => {
    if (args.reminder.due_notification_id) {
        await Notifications.cancelScheduledNotificationAsync(args.reminder.due_notification_id);
    }
    if (args.reminder.pre_notification_id) {
        await Notifications.cancelScheduledNotificationAsync(args.reminder.pre_notification_id);
    }
};

export const handleReminderNotificationReceived = async (notification: Notifications.Notification): Promise<void> => {
    const data = extractReminderNotificationData(notification?.request?.content?.data);
    if (!data) return;

    const now = Date.now();
    const reminder = await getReminderById({ reminder_id: data.reminder_id });
    if (!reminder) return;
    if (isStaleNotificationPayload(data, reminder)) {
        await insertReminderEvent({
            id: generateUUID(),
            reminder_id: reminder.id,
            event_type: 'updated',
            event_at: now,
            actor: 'system',
            payload_json: JSON.stringify({
                note: 'stale_notification_ignored',
                reason: 'due_at_mismatch',
                trigger_kind: data.kind,
                notification_due_at: data.due_at,
                reminder_due_at: reminder.due_at,
            }),
            created_at: now,
        });
        return;
    }

    if (data.kind === 'pre_alert') {
        await insertReminderEvent({
            id: generateUUID(),
            reminder_id: reminder.id,
            event_type: 'pre_alert_triggered',
            event_at: now,
            actor: 'system',
            payload_json: JSON.stringify({ notification_kind: 'pre_alert' }),
            created_at: now,
        });
        return;
    }

    if (!isTerminalStatus(reminder.status)) {
        await updateReminder({
            id: reminder.id,
            patch: { status: 'triggered', delivered_at: now },
            updated_at: now,
            expected_updated_at: reminder.updated_at,
        });
    }
    await insertReminderEvent({
        id: generateUUID(),
        reminder_id: reminder.id,
        event_type: 'due_triggered',
        event_at: now,
        actor: 'system',
        payload_json: JSON.stringify({ notification_kind: 'due' }),
        created_at: now,
    });
};

export const handleReminderNotificationResponse = async (
    response: Notifications.NotificationResponse
): Promise<void> => {
    const now = Date.now();
    const data = extractReminderNotificationData(response?.notification?.request?.content?.data);
    if (!data) return;

    const reminder = await getReminderById({ reminder_id: data.reminder_id });
    if (!reminder) return;
    if (isStaleNotificationPayload(data, reminder)) {
        await insertReminderEvent({
            id: generateUUID(),
            reminder_id: reminder.id,
            event_type: 'updated',
            event_at: now,
            actor: 'system',
            payload_json: JSON.stringify({
                note: 'stale_notification_action_ignored',
                reason: 'due_at_mismatch',
                action_id: response.actionIdentifier,
                trigger_kind: data.kind,
                notification_due_at: data.due_at,
                reminder_due_at: reminder.due_at,
            }),
            created_at: now,
        });
        return;
    }

    if (isTerminalStatus(reminder.status)) {
        await insertReminderEvent({
            id: generateUUID(),
            reminder_id: reminder.id,
            event_type: 'updated',
            event_at: now,
            actor: 'system',
            payload_json: JSON.stringify({
                note: 'action_ignored_terminal',
                action_id: response.actionIdentifier,
                status: reminder.status,
            }),
            created_at: now,
        });
        return;
    }

    await runInTransaction(async () => {
        switch (response.actionIdentifier) {
            case REMINDER_ACTION_ACCEPT: {
                await updateReminder({
                    id: reminder.id,
                    patch: {
                        status: 'completed',
                        completed_at: now,
                        due_notification_id: null,
                        pre_notification_id: null,
                    },
                    updated_at: now,
                    expected_updated_at: reminder.updated_at,
                });
                await insertReminderEvent({
                    id: generateUUID(),
                    reminder_id: reminder.id,
                    event_type: 'completed',
                    event_at: now,
                    actor: 'user',
                    payload_json: JSON.stringify({ source: 'notification_action' }),
                    created_at: now,
                });
                break;
            }
            case REMINDER_ACTION_DISMISS:
            case REMINDER_ACTION_EARLY_DISMISS: {
                const reason = response.actionIdentifier === REMINDER_ACTION_EARLY_DISMISS
                    ? 'early_dismiss_pre_alert'
                    : 'dismissed_from_notification';
                await logicalDeleteReminder({
                    id: reminder.id,
                    deleted_at: now,
                    reason,
                    updated_at: now,
                    expected_updated_at: reminder.updated_at,
                });
                await updateReminder({
                    id: reminder.id,
                    patch: {
                        due_notification_id: null,
                        pre_notification_id: null,
                    },
                    updated_at: now,
                    expected_updated_at: now,
                });
                await insertReminderEvent({
                    id: generateUUID(),
                    reminder_id: reminder.id,
                    event_type: 'deleted',
                    event_at: now,
                    actor: 'user',
                    payload_json: JSON.stringify({ reason }),
                    created_at: now,
                });
                break;
            }
            case REMINDER_ACTION_SNOOZE_10M: {
                const newDueAt = now + TEN_MINUTES_MS;
                await updateReminder({
                    id: reminder.id,
                    patch: {
                        status: 'snoozed',
                        due_at: newDueAt,
                    },
                    updated_at: now,
                    expected_updated_at: reminder.updated_at,
                });
                await insertReminderEvent({
                    id: generateUUID(),
                    reminder_id: reminder.id,
                    event_type: 'snoozed',
                    event_at: now,
                    actor: 'user',
                    payload_json: JSON.stringify({ previous_due_at: reminder.due_at, new_due_at: newDueAt }),
                    created_at: now,
                });
                break;
            }
            case REMINDER_ACTION_REPLY: {
                const pending = await enqueuePendingReminderReply({
                    reminder_id: reminder.id,
                    typed_text: extractReplyText(response),
                    notification_action_id: response.actionIdentifier,
                    trigger_kind: 'due',
                    created_at: now,
                });
                await insertReminderEvent({
                    id: generateUUID(),
                    reminder_id: reminder.id,
                    event_type: 'reply_requested',
                    event_at: now,
                    actor: 'user',
                    payload_json: JSON.stringify({
                        source: 'notification_action',
                        bridge_event_id: pending.id,
                        has_typed_text: Boolean(pending.typed_text),
                    }),
                    created_at: now,
                });
                break;
            }
            default:
                break;
        }
    });

    const latest = await getReminderById({ reminder_id: reminder.id });
    if (!latest) return;

    if (response.actionIdentifier === REMINDER_ACTION_SNOOZE_10M) {
        const scheduler = createReminderNotificationScheduler();
        try {
            const scheduling = await scheduler.scheduleReminder({
                reminder: latest,
                now_ms: now,
            });
            await updateReminder({
                id: latest.id,
                patch: {
                    due_notification_id: scheduling.due_notification_id,
                    pre_notification_id: scheduling.pre_notification_id,
                    last_error: null,
                },
                updated_at: now,
                expected_updated_at: latest.updated_at,
            });
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: latest.id,
                event_type: 'scheduled_notifications',
                event_at: now,
                actor: 'system',
                payload_json: JSON.stringify(scheduling),
                created_at: now,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown scheduling error';
            await updateReminder({
                id: latest.id,
                patch: { last_error: message },
                updated_at: now,
                expected_updated_at: latest.updated_at,
            });
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: latest.id,
                event_type: 'schedule_error',
                event_at: now,
                actor: 'system',
                payload_json: JSON.stringify({ phase: 'action_snooze', error: message }),
                created_at: now,
            });
        }
    } else if (
        response.actionIdentifier === REMINDER_ACTION_ACCEPT ||
        response.actionIdentifier === REMINDER_ACTION_DISMISS ||
        response.actionIdentifier === REMINDER_ACTION_EARLY_DISMISS
    ) {
        await cancelReminderNotifications({ reminder: reminder });
    }
};

const buildNotificationData = (
    reminder: ReminderRow,
    kind: 'pre_alert' | 'due'
): ReminderNotificationData => ({
    reminder_id: reminder.id,
    kind,
    title: reminder.title,
    due_at: reminder.due_at,
    timezone: reminder.timezone,
    deep_link: '/(tabs)',
    source: 'reminder_scheduler_v1',
});

const extractReminderNotificationData = (data: unknown): ReminderNotificationData | null => {
    if (!data || typeof data !== 'object') return null;
    const raw = data as Partial<ReminderNotificationData>;
    if (!raw.reminder_id || !raw.kind || (raw.kind !== 'pre_alert' && raw.kind !== 'due')) return null;
    if (typeof raw.due_at !== 'number' || Number.isNaN(raw.due_at)) return null;
    if (raw.source !== 'reminder_scheduler_v1') return null;
    return raw as ReminderNotificationData;
};

const isStaleNotificationPayload = (data: ReminderNotificationData, reminder: ReminderRow): boolean => {
    return data.due_at !== reminder.due_at;
};

const isTerminalStatus = (status: ReminderStatus): boolean => {
    return status === 'completed' || status === 'deleted';
};

const extractReplyText = (response: Notifications.NotificationResponse): string | null => {
    const raw = (response as unknown as { userText?: unknown }).userText;
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : null;
};

const runInTransaction = async (work: () => Promise<void>): Promise<void> => {
    const db = getDatabase();
    await db.execAsync('BEGIN TRANSACTION;');
    try {
        await work();
        await db.execAsync('COMMIT;');
    } catch (error) {
        await db.execAsync('ROLLBACK;');
        throw error;
    }
};
