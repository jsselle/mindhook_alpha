import * as SQLite from 'expo-sqlite';
import { DDL_STATEMENTS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'brain_app.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDatabase = (): SQLite.SQLiteDatabase => {
    if (!dbInstance) {
        dbInstance = SQLite.openDatabaseSync(DB_NAME);
    }
    return dbInstance;
};

export const initializeDatabase = async (): Promise<void> => {
    const db = getDatabase();

    // Execute all DDL statements
    await db.execAsync(DDL_STATEMENTS);

    // Store schema version for future migrations
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
    INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
  `);
};

export const resetDatabase = async (): Promise<void> => {
    const db = getDatabase();

    // Drop all tables in reverse dependency order
    await db.execAsync(`
    DROP TABLE IF EXISTS entity_index;
    DROP TABLE IF EXISTS memory_items;
    DROP TABLE IF EXISTS attachment_metadata;
    DROP TABLE IF EXISTS message_attachments;
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS schema_version;
  `);

    // Reinitialize
    await initializeDatabase();
};

export const closeDatabase = (): void => {
    if (dbInstance) {
        // Note: expo-sqlite sync API doesn't have explicit close
        dbInstance = null;
    }
};

// For testing: inject mock database
export const setDatabaseInstance = (db: SQLite.SQLiteDatabase | null): void => {
    dbInstance = db;
};
