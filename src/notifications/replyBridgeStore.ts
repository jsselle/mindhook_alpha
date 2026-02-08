import { getDatabase } from '../db/connection';
import { generateUUID } from '../utils/uuid';

export interface PendingReminderReply {
    id: string;
    reminder_id: string;
    typed_text: string | null;
    notification_action_id: string;
    trigger_kind: 'due';
    created_at: number;
    consumed_at: number | null;
}

export const enqueuePendingReminderReply = async (args: {
    reminder_id: string;
    typed_text: string | null;
    notification_action_id: string;
    trigger_kind: 'due';
    created_at: number;
}): Promise<PendingReminderReply> => {
    const db = getDatabase();
    const row: PendingReminderReply = {
        id: generateUUID(),
        reminder_id: args.reminder_id,
        typed_text: normalizeTypedText(args.typed_text),
        notification_action_id: args.notification_action_id,
        trigger_kind: args.trigger_kind,
        created_at: args.created_at,
        consumed_at: null,
    };

    await db.runAsync(
        `INSERT INTO pending_reminder_replies
         (id, reminder_id, typed_text, notification_action_id, trigger_kind, created_at, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [
            row.id,
            row.reminder_id,
            row.typed_text,
            row.notification_action_id,
            row.trigger_kind,
            row.created_at,
        ]
    );

    return row;
};

export const consumeNextPendingReminderReply = async (): Promise<PendingReminderReply | null> => {
    const db = getDatabase();
    await db.execAsync('BEGIN TRANSACTION;');
    try {
        const next = await db.getFirstAsync<PendingReminderReply>(
            `SELECT id, reminder_id, typed_text, notification_action_id, trigger_kind, created_at, consumed_at
             FROM pending_reminder_replies
             WHERE consumed_at IS NULL
             ORDER BY created_at ASC
             LIMIT 1`
        );

        if (!next) {
            await db.execAsync('COMMIT;');
            return null;
        }

        const consumedAt = Date.now();
        const update = await db.runAsync(
            `UPDATE pending_reminder_replies
             SET consumed_at = ?
             WHERE id = ? AND consumed_at IS NULL`,
            [consumedAt, next.id]
        );
        if (!update?.changes) {
            await db.execAsync('ROLLBACK;');
            return null;
        }

        await db.execAsync('COMMIT;');
        return { ...next, consumed_at: consumedAt };
    } catch (error) {
        await db.execAsync('ROLLBACK;');
        throw error;
    }
};

export const releasePendingReminderReply = async (args: { id: string }): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `UPDATE pending_reminder_replies
         SET consumed_at = NULL
         WHERE id = ?`,
        [args.id]
    );
};

const normalizeTypedText = (value: string | null): string | null => {
    if (value == null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

