import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { getDatabase, initializeDatabase, resetDatabase, setDatabaseInstance } from '../connection';

// expo-sqlite is automatically mocked via jest.config.js moduleNameMapper

describe('Database Connection', () => {
    beforeEach(() => {
        // Clear any previous database instance
        setDatabaseInstance(null);
        resetMockDatabase();
    });

    describe('getDatabase', () => {
        it('returns same instance on multiple calls', () => {
            const db1 = getDatabase();
            const db2 = getDatabase();
            expect(db1).toBe(db2);
        });
    });

    describe('initializeDatabase', () => {
        it('executes DDL statements', async () => {
            await initializeDatabase();

            // Get the mock after initialization has created it
            const mockDb = getMockDatabase();
            expect(mockDb).not.toBeNull();
            expect(mockDb?.execAsync).toHaveBeenCalled();

            // Verify DDL contains expected table creations
            const calls = mockDb?.execAsync.mock.calls;
            const ddlCall = calls?.[0]?.[0] as string;
            expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS messages');
            expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS attachments');
            expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS memory_items');
        });
    });

    describe('resetDatabase', () => {
        it('drops and recreates all tables', async () => {
            await resetDatabase();

            // Get the mock after reset has used it
            const mockDb = getMockDatabase();
            expect(mockDb).not.toBeNull();

            // Should have DROP statements - get all SQL strings that were executed
            const allSql = mockDb!.execAsync.mock.calls.map((call: unknown[]) => call[0]).join(' ');
            expect(allSql).toContain('DROP TABLE IF EXISTS');
        });
    });
});
