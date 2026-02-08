jest.mock('../../utils/uuid', () => ({
    generateUUID: jest.fn(() => 'bridge-1'),
}));

import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { getDatabase, setDatabaseInstance } from '../../db/connection';
import {
    consumeNextPendingReminderReply,
    enqueuePendingReminderReply,
    releasePendingReminderReply,
} from '../replyBridgeStore';

describe('replyBridgeStore', () => {
    beforeEach(() => {
        resetMockDatabase();
        setDatabaseInstance(null);
        getDatabase();
    });

    it('enqueues pending reply payload with typed text', async () => {
        await enqueuePendingReminderReply({
            reminder_id: 'rem-1',
            typed_text: 'Running 5 minutes late',
            notification_action_id: 'REMINDER_REPLY',
            trigger_kind: 'due',
            created_at: 1700000000000,
        });

        const db = getMockDatabase()!;
        expect(db.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO pending_reminder_replies'),
            expect.arrayContaining(['bridge-1', 'rem-1', 'Running 5 minutes late', 'REMINDER_REPLY', 'due', 1700000000000])
        );
    });

    it('consumes oldest unconsumed pending reply exactly once', async () => {
        const db = getMockDatabase()!;
        db.getFirstAsync.mockResolvedValueOnce({
            id: 'bridge-1',
            reminder_id: 'rem-1',
            typed_text: 'text',
            notification_action_id: 'REMINDER_REPLY',
            trigger_kind: 'due',
            created_at: 1700000000000,
            consumed_at: null,
        });
        db.runAsync.mockResolvedValueOnce({ changes: 1 });
        jest.spyOn(Date, 'now').mockReturnValue(1700001000000);

        const consumed = await consumeNextPendingReminderReply();

        expect(db.execAsync).toHaveBeenCalledWith('BEGIN TRANSACTION;');
        expect(db.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('SET consumed_at = ?'),
            [1700001000000, 'bridge-1']
        );
        expect(db.execAsync).toHaveBeenCalledWith('COMMIT;');
        expect(consumed?.consumed_at).toBe(1700001000000);
        jest.restoreAllMocks();
    });

    it('releases consumed reply on failure', async () => {
        await releasePendingReminderReply({ id: 'bridge-1' });
        const db = getMockDatabase()!;
        expect(db.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('SET consumed_at = NULL'),
            ['bridge-1']
        );
    });
});
