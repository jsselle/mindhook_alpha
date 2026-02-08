import { getReminderById } from '../api/deviceReadApi';
import { insertReminderEvent } from '../api/deviceWriteApi';
import {
    consumeNextPendingReminderReply,
    PendingReminderReply,
    releasePendingReminderReply,
} from '../notifications/replyBridgeStore';
import { ReminderRow } from '../types/domain';
import { generateUUID } from '../utils/uuid';

export interface ReminderReplyDraft {
    requires_confirmation: boolean;
    composer_prefill: string;
    visible_text: string;
    llm_text: string;
}

export const buildReminderReplyDraft = (args: {
    pending: PendingReminderReply;
    reminder: ReminderRow | null;
}): ReminderReplyDraft => {
    const hasTypedText = Boolean(args.pending.typed_text);
    const visibleText = hasTypedText ? (args.pending.typed_text as string) : '';
    return {
        requires_confirmation: !hasTypedText,
        composer_prefill: hasTypedText ? buildComposerPrefill(args.pending, args.reminder) : '',
        visible_text: visibleText,
        llm_text: buildReminderReplyEnvelope({
            pending: args.pending,
            reminder: args.reminder,
            userMessage: visibleText,
        }),
    };
};

export const processNextPendingReminderReply = async (args: {
    sendDraft: (draft: ReminderReplyDraft, pending: PendingReminderReply) => Promise<void>;
    onNeedsConfirmation?: (draft: ReminderReplyDraft, pending: PendingReminderReply) => Promise<void>;
}): Promise<boolean> => {
    const pending = await consumeNextPendingReminderReply();
    if (!pending) return false;

    const reminder = await getReminderById({ reminder_id: pending.reminder_id });
    const draft = buildReminderReplyDraft({ pending, reminder });

    if (draft.requires_confirmation) {
        try {
            if (args.onNeedsConfirmation) {
                await args.onNeedsConfirmation(draft, pending);
            } else {
                return false;
            }
        } finally {
            // Keep manual-confirmation replies durable across app restarts.
            await releasePendingReminderReply({ id: pending.id });
        }
        return true;
    }

    try {
        await args.sendDraft(draft, pending);
        await logReplySentToLlm({ pending, reminder });
        return true;
    } catch (error) {
        await releasePendingReminderReply({ id: pending.id });
        if (reminder) {
            const now = Date.now();
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: reminder.id,
                event_type: 'updated',
                event_at: now,
                actor: 'system',
                payload_json: JSON.stringify({
                    note: 'reply_send_failed_requeued',
                    bridge_event_id: pending.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }),
                created_at: now,
            });
        }
        return false;
    }
};

export const buildReminderReplyEnvelope = (args: {
    pending: PendingReminderReply;
    reminder: ReminderRow | null;
    userMessage: string;
}): string => {
    const reminder = args.reminder;
    const title = reminder?.title ?? 'Unknown reminder';
    const dueAt = reminder?.due_at ?? 0;
    const timezone = reminder?.timezone ?? 'unknown';
    const typedReply = args.pending.typed_text ?? '';
    return [
        '[Reminder Context]',
        `reminder_id: ${args.pending.reminder_id}`,
        `title: ${title}`,
        `original_due_at: ${dueAt}`,
        `timezone: ${timezone}`,
        `trigger_kind: ${args.pending.trigger_kind}`,
        `user_reply: ${typedReply}`,
        '',
        'User message:',
        args.userMessage,
    ].join('\n');
};

export const logReplySentToLlm = async (args: {
    pending: PendingReminderReply;
    reminder: ReminderRow | null;
}): Promise<void> => {
    if (!args.reminder) return;
    const now = Date.now();
    await insertReminderEvent({
        id: generateUUID(),
        reminder_id: args.reminder.id,
        event_type: 'reply_sent_to_llm',
        event_at: now,
        actor: 'system',
        payload_json: JSON.stringify({
            bridge_event_id: args.pending.id,
            notification_action_id: args.pending.notification_action_id,
            typed_text_present: Boolean(args.pending.typed_text),
        }),
        created_at: now,
    });
};

const buildComposerPrefill = (
    pending: PendingReminderReply,
    reminder: ReminderRow | null
): string => {
    const title = reminder?.title?.trim() || 'reminder';
    const dueAt = formatDueAt(reminder?.due_at ?? null);
    const typedText = pending.typed_text?.trim() ?? '';
    if (dueAt) {
        return `Reminder "${title}" due ${dueAt}\nThis is in context of reminder ${pending.reminder_id}.\n\n${typedText}`;
    }
    return `Reminder "${title}"\nThis is in context of reminder ${pending.reminder_id}.\n\n${typedText}`;
};

const formatDueAt = (epochMs: number | null): string | null => {
    if (epochMs == null || !Number.isFinite(epochMs) || epochMs <= 0) return null;
    return new Date(epochMs).toLocaleString();
};
