jest.mock('../../notifications/replyBridgeStore');
jest.mock('../../api/deviceReadApi');
jest.mock('../../api/deviceWriteApi');
jest.mock('../../utils/uuid', () => ({
    generateUUID: jest.fn(() => 'evt-1'),
}));

import { getReminderById } from '../../api/deviceReadApi';
import { insertReminderEvent } from '../../api/deviceWriteApi';
import {
    consumeNextPendingReminderReply,
    releasePendingReminderReply,
} from '../../notifications/replyBridgeStore';
import {
    buildReminderReplyEnvelope,
    buildReminderReplyDraft,
    logReplySentToLlm,
    processNextPendingReminderReply,
} from '../reminderReplyForegroundBridge';

const basePending = {
    id: 'bridge-1',
    reminder_id: 'rem-1',
    typed_text: 'Running late by 10 minutes',
    notification_action_id: 'REMINDER_REPLY',
    trigger_kind: 'due' as const,
    created_at: 1700000000000,
    consumed_at: null,
};

const baseReminder = {
    id: 'rem-1',
    title: 'Doctor appointment',
    topic: null,
    notes: null,
    due_at: 1700000600000,
    timezone: 'America/Los_Angeles',
    status: 'triggered' as const,
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

describe('ChatScreen reminder reply bridge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('preserves typed reply text in visible + llm draft', () => {
        const draft = buildReminderReplyDraft({
            pending: basePending,
            reminder: baseReminder,
        });

        expect(draft.requires_confirmation).toBe(false);
        expect(draft.visible_text).toBe('Running late by 10 minutes');
        expect(draft.composer_prefill).toContain('Doctor appointment');
        expect(draft.llm_text).toContain('user_reply: Running late by 10 minutes');
        expect(draft.llm_text).toContain('reminder_id: rem-1');
    });

    it('fallback requires manual confirmation when typed text is absent', () => {
        const draft = buildReminderReplyDraft({
            pending: { ...basePending, typed_text: null },
            reminder: baseReminder,
        });

        expect(draft.requires_confirmation).toBe(true);
        expect(draft.visible_text).toBe('');
        expect(draft.composer_prefill).toBe('');
    });

    it('auto-send consumes once and logs reply_sent_to_llm', async () => {
        (consumeNextPendingReminderReply as jest.Mock)
            .mockResolvedValueOnce(basePending)
            .mockResolvedValueOnce(null);
        (getReminderById as jest.Mock).mockResolvedValue(baseReminder);
        const sendDraft = jest.fn().mockResolvedValue(undefined);
        jest.spyOn(Date, 'now').mockReturnValue(1700001000000);

        const first = await processNextPendingReminderReply({ sendDraft });
        const second = await processNextPendingReminderReply({ sendDraft });

        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(sendDraft).toHaveBeenCalledTimes(1);
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'reply_sent_to_llm',
        }));
        jest.restoreAllMocks();
    });

    it('failed send requeues pending reply', async () => {
        (consumeNextPendingReminderReply as jest.Mock).mockResolvedValueOnce(basePending);
        (getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);
        const sendDraft = jest.fn().mockRejectedValue(new Error('ws failed'));

        const result = await processNextPendingReminderReply({ sendDraft });

        expect(result).toBe(false);
        expect(releasePendingReminderReply).toHaveBeenCalledWith({ id: 'bridge-1' });
    });

    it('manual confirmation path does not auto-send', async () => {
        (consumeNextPendingReminderReply as jest.Mock).mockResolvedValueOnce({
            ...basePending,
            typed_text: null,
        });
        (getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);
        const sendDraft = jest.fn().mockResolvedValue(undefined);
        const onNeedsConfirmation = jest.fn().mockResolvedValue(undefined);

        const processed = await processNextPendingReminderReply({
            sendDraft,
            onNeedsConfirmation,
        });

        expect(processed).toBe(true);
        expect(onNeedsConfirmation).toHaveBeenCalledTimes(1);
        expect(sendDraft).not.toHaveBeenCalled();
        expect(releasePendingReminderReply).toHaveBeenCalledWith({ id: 'bridge-1' });
    });

    it('manual confirmation without callback requeues and returns false', async () => {
        (consumeNextPendingReminderReply as jest.Mock).mockResolvedValueOnce({
            ...basePending,
            typed_text: null,
        });
        (getReminderById as jest.Mock).mockResolvedValueOnce(baseReminder);

        const processed = await processNextPendingReminderReply({
            sendDraft: jest.fn(),
        });

        expect(processed).toBe(false);
        expect(releasePendingReminderReply).toHaveBeenCalledWith({ id: 'bridge-1' });
    });

    it('builds envelope from confirmed in-app user message', () => {
        const envelope = buildReminderReplyEnvelope({
            pending: { ...basePending, typed_text: null },
            reminder: baseReminder,
            userMessage: 'I can do this tomorrow morning.',
        });
        expect(envelope).toContain('user_reply: ');
        expect(envelope).toContain('User message:\nI can do this tomorrow morning.');
    });

    it('logs reply_sent_to_llm for confirmed manual send', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700001000000);
        await logReplySentToLlm({
            pending: basePending,
            reminder: baseReminder,
        });
        expect(insertReminderEvent).toHaveBeenCalledWith(expect.objectContaining({
            reminder_id: 'rem-1',
            event_type: 'reply_sent_to_llm',
        }));
        jest.restoreAllMocks();
    });
});
