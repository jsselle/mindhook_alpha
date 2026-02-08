import {
    applyOptimisticReminderDateEdit,
    applyOptimisticReminderDelete,
    sortReminderRowsForDrawer,
    toReminderDrawerErrorMessage,
} from '../useReminderDrawer';
import { ReminderRow } from '../../types/domain';

const baseReminder = (patch: Partial<ReminderRow>): ReminderRow => ({
    id: patch.id ?? 'r-1',
    title: patch.title ?? 'Test reminder',
    topic: null,
    notes: null,
    due_at: patch.due_at ?? 2000,
    timezone: 'America/Los_Angeles',
    status: patch.status ?? 'scheduled',
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
    created_at: patch.created_at ?? 1000,
    updated_at: patch.updated_at ?? 1000,
});

describe('useReminderDrawer sorting', () => {
    it('sorts by due_at ASC then created_at ASC then id ASC', () => {
        const reminders: ReminderRow[] = [
            baseReminder({ id: 'r-3', due_at: 2000, created_at: 1000 }),
            baseReminder({ id: 'r-2', due_at: 2000, created_at: 900 }),
            baseReminder({ id: 'r-1', due_at: 1000, created_at: 1100 }),
            baseReminder({ id: 'r-0', due_at: 2000, created_at: 900 }),
        ];

        const sorted = sortReminderRowsForDrawer(reminders);
        expect(sorted.map((row) => row.id)).toEqual(['r-1', 'r-0', 'r-2', 'r-3']);
    });

    it('edit date optimistic update re-sorts to earliest due first', () => {
        const reminders: ReminderRow[] = [
            baseReminder({ id: 'r-1', due_at: 4000, created_at: 1000, status: 'scheduled' }),
            baseReminder({ id: 'r-2', due_at: 2000, created_at: 1000, status: 'scheduled' }),
        ];

        const updated = applyOptimisticReminderDateEdit({
            reminders,
            reminderId: 'r-1',
            dueAt: 1000,
            updatedAt: 5000,
        });

        expect(updated.map((row) => row.id)).toEqual(['r-1', 'r-2']);
        expect(updated[0].due_at).toBe(1000);
        expect(updated[0].updated_at).toBe(5000);
    });

    it('edit date optimistic update converts triggered back to scheduled', () => {
        const reminders: ReminderRow[] = [
            baseReminder({ id: 'r-1', due_at: 4000, status: 'triggered' }),
        ];
        const updated = applyOptimisticReminderDateEdit({
            reminders,
            reminderId: 'r-1',
            dueAt: 5000,
            updatedAt: 7000,
        });
        expect(updated[0].status).toBe('scheduled');
    });

    it('delete optimistic update removes reminder from active list', () => {
        const reminders: ReminderRow[] = [
            baseReminder({ id: 'r-1' }),
            baseReminder({ id: 'r-2' }),
        ];
        const updated = applyOptimisticReminderDelete({
            reminders,
            reminderId: 'r-1',
        });
        expect(updated.map((row) => row.id)).toEqual(['r-2']);
    });

    it('maps operation errors to user-friendly message', () => {
        expect(toReminderDrawerErrorMessage(new Error('network failed'))).toBe('network failed');
        expect(toReminderDrawerErrorMessage({})).toBe('Unknown reminder operation error');
    });
});
