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

    // Lightweight additive migrations for existing installs
    await ensureColumns(db, 'attachment_metadata', [
        { name: 'text', sqlType: 'TEXT' },
        { name: 'tags_json', sqlType: 'TEXT' },
        { name: 'event_at', sqlType: 'INTEGER' },
    ]);
    await ensureColumns(db, 'memory_items', [
        { name: 'text', sqlType: 'TEXT' },
        { name: 'tags_json', sqlType: 'TEXT' },
        { name: 'event_at', sqlType: 'INTEGER' },
    ]);
    await ensureColumns(db, 'reminders', [
        { name: 'topic', sqlType: 'TEXT' },
        { name: 'notes', sqlType: 'TEXT' },
        { name: 'pre_alert_minutes', sqlType: 'INTEGER' },
        { name: 'due_notification_id', sqlType: 'TEXT' },
        { name: 'pre_notification_id', sqlType: 'TEXT' },
        { name: 'delivered_at', sqlType: 'INTEGER' },
        { name: 'completed_at', sqlType: 'INTEGER' },
        { name: 'deleted_at', sqlType: 'INTEGER' },
        { name: 'deleted_reason', sqlType: 'TEXT' },
        { name: 'last_error', sqlType: 'TEXT' },
        { name: 'metadata_json', sqlType: 'TEXT' },
        { name: 'updated_at', sqlType: 'INTEGER' },
    ]);
    await ensureColumns(db, 'pending_reminder_replies', [
        { name: 'typed_text', sqlType: 'TEXT' },
        { name: 'notification_action_id', sqlType: 'TEXT' },
        { name: 'trigger_kind', sqlType: 'TEXT' },
        { name: 'created_at', sqlType: 'INTEGER' },
        { name: 'consumed_at', sqlType: 'INTEGER' },
    ]);
    await db.execAsync(`
    UPDATE reminders SET updated_at = created_at WHERE updated_at IS NULL;
    UPDATE reminders SET pre_alert_minutes = 10 WHERE pre_alert_minutes IS NULL;
  `);

    // Create post-migration indexes that depend on newly added columns.
    if (await hasColumn(db, 'attachment_metadata', 'event_at')) {
        await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_metadata_event_at ON attachment_metadata(event_at);`);
    }
    if (await hasColumn(db, 'memory_items', 'event_at')) {
        await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_memory_event_at ON memory_items(event_at);`);
    }

    await rebuildSearchFts(db);

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
    DROP TABLE IF EXISTS pending_reminder_replies;
    DROP TABLE IF EXISTS memory_search_fts;
    DROP TABLE IF EXISTS reminder_events;
    DROP TABLE IF EXISTS reminders;
    DROP TABLE IF EXISTS memory_tags;
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

const ensureColumns = async (
    db: SQLite.SQLiteDatabase,
    table: string,
    columns: Array<{ name: string; sqlType: string }>
): Promise<void> => {
    const pragmaRows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    const existing = new Set(pragmaRows.map((row) => row.name));

    for (const col of columns) {
        if (!existing.has(col.name)) {
            await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.sqlType};`);
        }
    }
};

const rebuildSearchFts = async (db: SQLite.SQLiteDatabase): Promise<void> => {
    const hasMemoryText = await hasColumn(db, 'memory_items', 'text');
    const hasMetadataText = await hasColumn(db, 'attachment_metadata', 'text');

    const memoryTextExpr = hasMemoryText
        ? 'text'
        : "(subject || ' ' || predicate || ' ' || object)";
    const metadataTextExpr = hasMetadataText ? 'text' : 'payload_json';

    await db.execAsync(`
    DELETE FROM memory_search_fts;

    INSERT INTO memory_search_fts (source_type, source_id, text)
    SELECT 'memory', id, ${memoryTextExpr}
    FROM memory_items
    WHERE ${memoryTextExpr} IS NOT NULL AND TRIM(${memoryTextExpr}) != '';

    INSERT INTO memory_search_fts (source_type, source_id, text)
    SELECT 'attachment_metadata', id, ${metadataTextExpr}
    FROM attachment_metadata
    WHERE ${metadataTextExpr} IS NOT NULL AND TRIM(${metadataTextExpr}) != '';
  `);
};

const hasColumn = async (
    db: SQLite.SQLiteDatabase,
    table: string,
    column: string
): Promise<boolean> => {
    const pragmaRows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    return pragmaRows.some((row) => row.name === column);
};
