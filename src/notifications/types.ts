export const REMINDER_NOTIFICATION_CHANNEL_ID = 'reminders';

export const REMINDER_NOTIFICATION_CATEGORY_DUE = 'REMINDER_DUE';
export const REMINDER_NOTIFICATION_CATEGORY_PRE_ALERT = 'REMINDER_PRE_ALERT';

export const REMINDER_ACTION_ACCEPT = 'REMINDER_ACCEPT';
export const REMINDER_ACTION_DISMISS = 'REMINDER_DISMISS';
export const REMINDER_ACTION_SNOOZE_10M = 'REMINDER_SNOOZE_10M';
export const REMINDER_ACTION_REPLY = 'REMINDER_REPLY';
export const REMINDER_ACTION_EARLY_DISMISS = 'REMINDER_EARLY_DISMISS';

export interface ReminderNotificationData {
    reminder_id: string;
    kind: 'pre_alert' | 'due';
    title: string;
    due_at: number;
    timezone: string;
    deep_link: string;
    source: 'reminder_scheduler_v1';
}
