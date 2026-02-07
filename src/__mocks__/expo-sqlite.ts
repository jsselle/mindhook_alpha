// Mock SQLite for portable testing without native modules
export interface MockDatabase {
    execAsync: jest.Mock;
    runAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    getAllAsync: jest.Mock;
}

const createMockDatabase = (): MockDatabase => ({
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
});

let mockDb: MockDatabase | null = null;

export const openDatabaseSync = jest.fn(() => {
    if (!mockDb) mockDb = createMockDatabase();
    return mockDb;
});

export const getMockDatabase = (): MockDatabase | null => mockDb;
export const resetMockDatabase = (): void => { mockDb = null; };
