import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { setDatabaseInstance } from '../../db/connection';
import { getAttachmentBundle, getRecentMessages, searchAttachments, searchMemory } from '../deviceReadApi';


describe('DeviceReadAPI', () => {
    beforeEach(() => {
        resetMockDatabase();
        setDatabaseInstance(null);
    });

    describe('searchMemory', () => {
        it('uses FTS query for text filter', async () => {
            await searchMemory({ text: 'keys', limit: 10 });

            const mockDb = getMockDatabase();
            expect(mockDb?.getAllAsync).toHaveBeenCalled();
            const firstSql = (mockDb?.getAllAsync as jest.Mock).mock.calls[0][0] as string;
            expect(firstSql).toContain('FROM memory_search_fts');
            expect(firstSql).toContain('MATCH');
        });

        it('queries both memory and attachment_metadata sources', async () => {
            await searchMemory({ limit: 5 });

            const mockDb = getMockDatabase();
            expect(mockDb?.getAllAsync).toHaveBeenCalledTimes(2);
            expect((mockDb?.getAllAsync as jest.Mock).mock.calls[0][0]).toContain('FROM memory_items');
            expect((mockDb?.getAllAsync as jest.Mock).mock.calls[1][0]).toContain('FROM attachment_metadata');
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
