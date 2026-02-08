jest.mock('../../api/deviceReadApi');
jest.mock('../../api/deviceWriteApi');
jest.mock('../../notifications/replyBridgeStore');
jest.mock('../../utils/uuid', () => {
    let counter = 0;
    return {
        generateUUID: jest.fn(() => {
            counter += 1;
            return `id-${counter}`;
        }),
    };
});

import * as Notifications from 'expo-notifications';
import {
    getReminderById,
    listReminders,
} from '../../api/deviceReadApi';
import {
    insertReminder,
    insertReminderEvent,
    logicalDeleteReminder,
    updateReminder,
} from '../../api/deviceWriteApi';
import {
    consumeNextPendingReminderReply,
    enqueuePendingReminderReply,
    releasePendingReminderReply,
} from '../../notifications/replyBridgeStore';
import { createReminderNotificationScheduler, handleReminderNotificationResponse } from '../../notifications/reminderNotificationService';
import { REMINDER_ACTION_EARLY_DISMISS, REMINDER_ACTION_REPLY, REMINDER_ACTION_SNOOZE_10M } from '../../notifications/types';
import { processNextPendingReminderReply } from '../../screens/reminderReplyForegroundBridge';
import { executeToolCall, setReminderNotificationScheduler } from '../../tools/dispatcher';
import { ReminderEventRow, ReminderRow } from '../../types/domain';

describe('reminder lifecycle e2e', () => {
    let reminders: Map<string, ReminderRow>;
    let reminderEvents: ReminderEventRow[];
    let pendingReplies: Array<{
        id: string;
        reminder_id: string;
        typed_text: string | null;
        notification_action_id: string;
        trigger_kind: 'due' | 'pre_alert';
        created_at: number;
        consumed_at: number | null;
    }>;

    beforeEach(() => {
        jest.clearAllMocks();
        (Notifications as { __resetNotificationsMock?: () => void }).__resetNotificationsMock?.();

        reminders = new Map();
        reminderEvents = [];
        pendingReplies = [];

        (insertReminder as jest.Mock).mockImplementation(async (row: ReminderRow) => {
            reminders.set(row.id, { ...row });
        });
        (insertReminderEvent as jest.Mock).mockImplementation(async (row: ReminderEventRow) => {
            reminderEvents.push({ ...row });
        });
        (getReminderById as jest.Mock).mockImplementation(async (args: { reminder_id: string }) => {
            const row = reminders.get(args.reminder_id);
            return row ? { ...row } : null;
        });
        (listReminders as jest.Mock).mockImplementation(async (args: {
            statuses?: string[] | null;
            include_deleted?: boolean;
            limit: number;
            offset?: number;
        }) => {
            const filtered = Array.from(reminders.values())
                .filter((row) => args.include_deleted ? true : row.status !== 'deleted')
                .filter((row) => (args.statuses && args.statuses.length > 0 ? args.statuses.includes(row.status) : true))
                .sort((a, b) => a.due_at - b.due_at || a.created_at - b.created_at);
            const offset = args.offset ?? 0;
            return filtered.slice(offset, offset + args.limit).map((row) => ({ ...row }));
        });
        (updateReminder as jest.Mock).mockImplementation(async (args: {
            id: string;
            patch: Partial<ReminderRow>;
            updated_at: number;
            expected_updated_at?: number;
        }) => {
            const existing = reminders.get(args.id);
            if (!existing) throw new Error(`Reminder not found: ${args.id}`);
            if (args.expected_updated_at != null && existing.updated_at !== args.expected_updated_at) {
                throw new Error(`Reminder update conflict for id: ${args.id}`);
            }
            reminders.set(args.id, {
                ...existing,
                ...args.patch,
                updated_at: args.updated_at,
            });
        });
        (logicalDeleteReminder as jest.Mock).mockImplementation(async (args: {
            id: string;
            deleted_at: number;
            reason: string;
            updated_at: number;
            expected_updated_at?: number;
        }) => {
            const existing = reminders.get(args.id);
            if (!existing) throw new Error(`Reminder not found: ${args.id}`);
            if (args.expected_updated_at != null && existing.updated_at !== args.expected_updated_at) {
                throw new Error(`Reminder update conflict for id: ${args.id}`);
            }
            reminders.set(args.id, {
                ...existing,
                status: 'deleted',
                deleted_at: args.deleted_at,
                deleted_reason: args.reason,
                updated_at: args.updated_at,
            });
        });

        (enqueuePendingReminderReply as jest.Mock).mockImplementation(async (args: {
            reminder_id: string;
            typed_text?: string | null;
            notification_action_id: string;
            trigger_kind: 'due' | 'pre_alert';
            created_at: number;
        }) => {
            const row = {
                id: `bridge-${pendingReplies.length + 1}`,
                reminder_id: args.reminder_id,
                typed_text: args.typed_text ?? null,
                notification_action_id: args.notification_action_id,
                trigger_kind: args.trigger_kind,
                created_at: args.created_at,
                consumed_at: null,
            };
            pendingReplies.push(row);
            return row;
        });
        (consumeNextPendingReminderReply as jest.Mock).mockImplementation(async () => {
            const next = pendingReplies.find((row) => row.consumed_at == null);
            if (!next) return null;
            next.consumed_at = Date.now();
            return { ...next };
        });
        (releasePendingReminderReply as jest.Mock).mockImplementation(async (args: { id: string }) => {
            const row = pendingReplies.find((entry) => entry.id === args.id);
            if (row) row.consumed_at = null;
        });

        setReminderNotificationScheduler(createReminderNotificationScheduler());
    });

    it('covers create, update, snooze, pre-alert dismiss, and reply bridge update', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

        const created = await executeToolCall('create_reminder', {
            schema_version: '1',
            reminder_id: 'rem-1',
            title: 'Call mom',
            due_at: 1700086400000,
            timezone: 'America/Los_Angeles',
            pre_alert_minutes: 10,
            created_at: 1700000000000,
        });
        expect(created).toEqual(expect.objectContaining({
            reminder_id: 'rem-1',
            status: 'scheduled',
        }));
        const rem1AfterCreate = reminders.get('rem-1');
        expect(rem1AfterCreate?.due_notification_id).toBeTruthy();
        expect(rem1AfterCreate?.pre_notification_id).toBeTruthy();

        const previousDueNotificationId = rem1AfterCreate?.due_notification_id;
        const previousPreNotificationId = rem1AfterCreate?.pre_notification_id;

        await executeToolCall('update_reminder', {
            schema_version: '1',
            reminder_id: 'rem-1',
            due_at: 1700088200000,
            updated_at: 1700000010000,
        });
        const rem1AfterUpdate = reminders.get('rem-1');
        expect(rem1AfterUpdate?.due_notification_id).toBeTruthy();
        expect(rem1AfterUpdate?.pre_notification_id).toBeTruthy();
        expect(rem1AfterUpdate?.due_notification_id).not.toBe(previousDueNotificationId);
        expect(rem1AfterUpdate?.pre_notification_id).not.toBe(previousPreNotificationId);

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_SNOOZE_10M,
            notification: {
                request: {
                    content: { data: { reminder_id: 'rem-1', kind: 'due', due_at: 1700088200000, source: 'reminder_scheduler_v1' } },
                },
            },
        } as never);
        const rem1AfterSnooze = reminders.get('rem-1');
        expect(rem1AfterSnooze?.status).toBe('snoozed');
        expect(rem1AfterSnooze?.due_at).toBe(1700000600000);

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_EARLY_DISMISS,
            notification: {
                request: {
                    content: { data: { reminder_id: 'rem-1', kind: 'pre_alert', due_at: 1700000600000, source: 'reminder_scheduler_v1' } },
                },
            },
        } as never);
        const rem1AfterDismiss = reminders.get('rem-1');
        expect(rem1AfterDismiss?.status).toBe('deleted');
        expect(rem1AfterDismiss?.due_notification_id).toBeNull();
        expect(rem1AfterDismiss?.pre_notification_id).toBeNull();

        await executeToolCall('create_reminder', {
            schema_version: '1',
            reminder_id: 'rem-2',
            title: 'Send report',
            due_at: 1700086400000,
            timezone: 'America/Los_Angeles',
            pre_alert_minutes: 10,
            created_at: 1700000020000,
        });
        const rem2BeforeReply = reminders.get('rem-2');
        expect(rem2BeforeReply).toBeDefined();

        await handleReminderNotificationResponse({
            actionIdentifier: REMINDER_ACTION_REPLY,
            userText: 'Actually make it 15 minutes later.',
            notification: {
                request: {
                    content: { data: { reminder_id: 'rem-2', kind: 'due', due_at: 1700086400000, source: 'reminder_scheduler_v1' } },
                },
            },
        } as never);

        const sendDraft = jest.fn(async (draft: { llm_text: string }) => {
            expect(draft.llm_text).toContain('reminder_id: rem-2');
            const current = reminders.get('rem-2');
            if (!current) throw new Error('Missing reminder rem-2');
            await executeToolCall('update_reminder', {
                schema_version: '1',
                reminder_id: 'rem-2',
                due_at: current.due_at + 15 * 60000,
                updated_at: 1700000030000,
            });
        });
        const processed = await processNextPendingReminderReply({ sendDraft });
        expect(processed).toBe(true);
        expect(sendDraft).toHaveBeenCalledTimes(1);
        expect(reminders.get('rem-2')?.due_at).toBe(1700087300000);

        const eventTypes = reminderEvents.map((event) => event.event_type);
        expect(eventTypes).toContain('scheduled_notifications');
        expect(eventTypes).toContain('snoozed');
        expect(eventTypes).toContain('deleted');
        expect(eventTypes).toContain('reply_requested');
        expect(eventTypes).toContain('reply_sent_to_llm');
        jest.restoreAllMocks();
    });
});
