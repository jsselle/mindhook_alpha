import { useCallback, useMemo, useState } from 'react';
import { listReminders } from '../api/deviceReadApi';
import { ReminderRow } from '../types/domain';
import { executeToolCall } from '../tools/dispatcher';
import { nowMs } from '../utils/time';

export const ACTIVE_REMINDER_STATUSES = ['scheduled', 'snoozed', 'triggered'] as const;

export interface ReminderDrawerState {
    visible: boolean;
    reminders: ReminderRow[];
    loading: boolean;
    error: string | null;
}

export const sortReminderRowsForDrawer = (rows: ReminderRow[]): ReminderRow[] => {
    return [...rows].sort((a, b) => {
        if (a.due_at !== b.due_at) return a.due_at - b.due_at;
        if (a.created_at !== b.created_at) return a.created_at - b.created_at;
        return a.id.localeCompare(b.id);
    });
};

export const toReminderDrawerErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return 'Unknown reminder operation error';
};

export const applyOptimisticReminderDateEdit = (args: {
    reminders: ReminderRow[];
    reminderId: string;
    dueAt: number;
    updatedAt: number;
}): ReminderRow[] => {
    const optimistic = args.reminders.map((row) => {
        if (row.id !== args.reminderId) return row;
        return {
            ...row,
            due_at: args.dueAt,
            updated_at: args.updatedAt,
            status: row.status === 'triggered' ? 'scheduled' : row.status,
        };
    });
    return sortReminderRowsForDrawer(optimistic);
};

export const applyOptimisticReminderDelete = (args: {
    reminders: ReminderRow[];
    reminderId: string;
}): ReminderRow[] => {
    return args.reminders.filter((row) => row.id !== args.reminderId);
};

export const useReminderDrawer = () => {
    const [state, setState] = useState<ReminderDrawerState>({
        visible: false,
        reminders: [],
        loading: false,
        error: null,
    });

    const refresh = useCallback(async () => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const reminders = await listReminders({
                statuses: [...ACTIVE_REMINDER_STATUSES],
                include_deleted: false,
                limit: 200,
                offset: 0,
            });
            setState((prev) => ({
                ...prev,
                reminders: sortReminderRowsForDrawer(reminders),
                loading: false,
                error: null,
            }));
        } catch (error) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: toReminderDrawerErrorMessage(error),
            }));
        }
    }, []);

    const openDrawer = useCallback(async () => {
        setState((prev) => ({ ...prev, visible: true }));
        await refresh();
    }, [refresh]);

    const closeDrawer = useCallback(() => {
        setState((prev) => ({ ...prev, visible: false }));
    }, []);

    const editReminderDate = useCallback(async (args: { reminder: ReminderRow; dueAt: number }) => {
        if (args.dueAt <= nowMs()) {
            throw new Error('Reminder date must be in the future.');
        }

        const updatedAt = nowMs();
        let snapshot: ReminderRow[] = [];
        setState((prev) => {
            snapshot = prev.reminders;
            return {
                ...prev,
                reminders: applyOptimisticReminderDateEdit({
                    reminders: prev.reminders,
                    reminderId: args.reminder.id,
                    dueAt: args.dueAt,
                    updatedAt,
                }),
                error: null,
            };
        });

        try {
            await executeToolCall('update_reminder', {
                schema_version: '1',
                reminder_id: args.reminder.id,
                due_at: args.dueAt,
                ...(args.reminder.status === 'triggered' ? { status: 'scheduled' } : {}),
                updated_at: updatedAt,
            });
            await refresh();
        } catch (error) {
            setState((prev) => ({
                ...prev,
                reminders: snapshot,
                error: toReminderDrawerErrorMessage(error),
            }));
            throw error;
        }
    }, [refresh]);

    const deleteReminder = useCallback(async (reminder: ReminderRow) => {
        const deletedAt = nowMs();
        let snapshot: ReminderRow[] = [];
        setState((prev) => {
            snapshot = prev.reminders;
            return {
                ...prev,
                reminders: applyOptimisticReminderDelete({
                    reminders: prev.reminders,
                    reminderId: reminder.id,
                }),
                error: null,
            };
        });

        try {
            await executeToolCall('cancel_reminder', {
                schema_version: '1',
                reminder_id: reminder.id,
                deleted_at: deletedAt,
                reason: 'deleted_from_reminder_drawer',
                actor: 'user',
            });
        } catch (error) {
            setState((prev) => ({
                ...prev,
                reminders: snapshot,
                error: toReminderDrawerErrorMessage(error),
            }));
            throw error;
        }
    }, []);

    return useMemo(() => ({
        state,
        openDrawer,
        closeDrawer,
        refresh,
        editReminderDate,
        deleteReminder,
    }), [closeDrawer, deleteReminder, editReminderDate, openDrawer, refresh, state]);
};
