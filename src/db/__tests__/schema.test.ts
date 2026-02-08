import { DDL_STATEMENTS, SCHEMA_VERSION } from '../schema';

describe('Database Schema', () => {
    it('has valid schema version', () => {
        expect(SCHEMA_VERSION).toBe(5);
    });

    it('enables foreign keys', () => {
        expect(DDL_STATEMENTS).toContain('PRAGMA foreign_keys = ON');
    });

    it('creates all required tables', () => {
        const requiredTables = [
            'messages',
            'attachments',
            'message_attachments',
            'attachment_metadata',
            'memory_items',
            'memory_tags',
            'entity_index',
            'reminders',
            'reminder_events',
            'pending_reminder_replies',
        ];

        requiredTables.forEach(table => {
            expect(DDL_STATEMENTS).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
        });
        expect(DDL_STATEMENTS).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS memory_search_fts');
    });

    it('creates required indexes', () => {
        const requiredIndexes = [
            'idx_messages_created_at',
            'idx_metadata_attachment',
            'idx_metadata_kind',
            'idx_memory_tags_tag',
            'idx_memory_tags_source',
            'idx_memory_subject',
            'idx_memory_type',
            'idx_entity_term',
            'idx_reminders_status_due',
            'idx_reminders_due_at',
            'idx_reminders_created_at',
            'idx_reminder_events_reminder',
            'idx_pending_reminder_replies_unconsumed',
        ];

        requiredIndexes.forEach(idx => {
            expect(DDL_STATEMENTS).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
        });
    });

    it('has CHECK constraints for enums', () => {
        expect(DDL_STATEMENTS).toContain("role IN ('user', 'assistant', 'system')");
        expect(DDL_STATEMENTS).toContain("type IN ('image', 'audio', 'video', 'file')");
        expect(DDL_STATEMENTS).toContain("kind IN ('transcript', 'scene', 'entities', 'summary', 'claims')");
        expect(DDL_STATEMENTS).toContain("status IN ('scheduled', 'triggered', 'snoozed', 'completed', 'deleted')");
    });
});
