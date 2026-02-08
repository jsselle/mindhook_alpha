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
            expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS reminders');
        });

        it('runs reminder backfills for updated_at and pre_alert_minutes', async () => {
            await initializeDatabase();

            const mockDb = getMockDatabase();
            const allSql = mockDb!.execAsync.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
            expect(allSql).toContain('UPDATE reminders SET updated_at = created_at WHERE updated_at IS NULL;');
            expect(allSql).toContain('UPDATE reminders SET pre_alert_minutes = 5 WHERE pre_alert_minutes IS NULL;');
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
