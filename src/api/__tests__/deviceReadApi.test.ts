import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { setDatabaseInstance } from '../../db/connection';
import { getAttachmentBundle, getRecentMessages, searchAttachments, searchMemory } from '../deviceReadApi';


describe('DeviceReadAPI', () => {
    beforeEach(() => {
        resetMockDatabase();
        setDatabaseInstance(null);
    });

    describe('searchMemory', () => {
        it('builds query with subject filter', async () => {
            await searchMemory({ subject: 'keys', limit: 10 });

            const mockDb = getMockDatabase();
            expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('subject = ?'),
                expect.arrayContaining(['keys', 10])
            );
        });

        it('orders by confidence DESC', async () => {
            await searchMemory({ limit: 5 });

            const mockDb = getMockDatabase();
            expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY confidence DESC'),
                expect.any(Array)
            );
        });
    });

    describe('searchAttachments', () => {
        it('joins entity_index table', async () => {
            await searchAttachments({ entities: ['keys', 'kitchen'], limit: 10 });

            const mockDb = getMockDatabase();
            expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('INNER JOIN entity_index'),
                expect.arrayContaining(['keys', 'kitchen', 10])
            );
        });

        it('returns empty for no entities', async () => {
            const result = await searchAttachments({ entities: [], limit: 10 });
            expect(result).toEqual([]);
        });
    });

    describe('getAttachmentBundle', () => {
        it('returns null for non-existent attachment', async () => {
            const mockDb = getMockDatabase();
            mockDb?.getFirstAsync.mockResolvedValueOnce(null);

            const result = await getAttachmentBundle({ attachment_id: 'not-found' });
            expect(result).toBeNull();
        });
    });

    describe('getRecentMessages', () => {
        it('orders by created_at DESC with limit', async () => {
            await getRecentMessages({ limit: 20 });

            const mockDb = getMockDatabase();
            expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY created_at DESC'),
                [20]
            );
        });
    });
});
